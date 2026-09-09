import JSZip from 'jszip';

/**
 * SheetJS bản community (dùng trong dự án) KHÔNG ghi được style/chart khi xuất .xlsx (tính năng
 * đó chỉ có ở bản Pro trả phí). Module này hậu xử lý trực tiếp các phần XML bên trong file .xlsx
 * (là 1 zip OOXML) sau khi SheetJS ghi xong, để thêm: tô màu nền ô + biểu đồ cột — cùng cách tiếp
 * cận thao tác XML thô đã dùng cho docx-export.
 */

const SML_NS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
/** Namespace của các file quan hệ .rels (dùng làm xmlns mặc định trong CHÍNH file .rels). */
const RELS_NS = 'http://schemas.openxmlformats.org/package/2006/relationships';
/** Namespace của tiền tố "r:" trên các thuộc tính r:id/r:embed BÊN TRONG 1 part (vd <drawing r:id="...">).
 * Khác với RELS_NS ở trên — nhầm 2 namespace này là nguyên nhân Excel báo lỗi "cần sửa chữa". */
const OFFICE_REL_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const CT_NS = 'http://schemas.openxmlformats.org/package/2006/content-types';

const parser = new DOMParser();
const serializer = new XMLSerializer();

function parseXml(text: string): Document {
  return parser.parseFromString(text, 'application/xml');
}

function serialize(doc: Document): string {
  return XML_HEADER + serializer.serializeToString(doc.documentElement);
}

const XML_HEADER = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';

export type CellFillKind = 'wrong' | 'blank';

export interface CellFillInstruction {
  /** Tham chiếu ô kiểu Excel, vd "I2". */
  cellRef: string;
  kind: CellFillKind;
}

export interface DistributionChartSpec {
  sheetName: string;
  title: string;
  /** Nhãn cột (khoảng điểm) — theo đúng thứ tự các dòng dữ liệu trên sheet. */
  categories: string[];
  values: number[];
  /** Dòng bắt đầu của dữ liệu (1-based) — mặc định dữ liệu ở cột A (nhãn) / B (số lượng). */
  firstDataRow: number;
}

async function readXml(zip: JSZip, path: string): Promise<Document> {
  const file = zip.file(path);
  if (!file) throw new Error(`Thiếu phần ${path} trong file .xlsx (không phải lỗi của người dùng — báo lại dev)`);
  return parseXml(await file.async('string'));
}

/** Thêm 2 fill (đỏ nhạt = sai, xám = bỏ trống) + 2 cellXfs tương ứng vào styles.xml, trả về style id để gán cho ô. */
async function addFillStyles(zip: JSZip): Promise<{ wrong: number; blank: number }> {
  const doc = await readXml(zip, 'xl/styles.xml');

  const fillsEl = doc.getElementsByTagNameNS(SML_NS, 'fills')[0];
  const existingFillCount = fillsEl.getElementsByTagNameNS(SML_NS, 'fill').length;
  const addFill = (rgb: string) => {
    const fillEl = doc.createElementNS(SML_NS, 'fill');
    const patternEl = doc.createElementNS(SML_NS, 'patternFill');
    patternEl.setAttribute('patternType', 'solid');
    const fgEl = doc.createElementNS(SML_NS, 'fgColor');
    fgEl.setAttribute('rgb', rgb);
    const bgEl = doc.createElementNS(SML_NS, 'bgColor');
    bgEl.setAttribute('indexed', '64');
    patternEl.appendChild(fgEl);
    patternEl.appendChild(bgEl);
    fillEl.appendChild(patternEl);
    fillsEl.appendChild(fillEl);
  };
  const wrongFillId = existingFillCount;
  const blankFillId = existingFillCount + 1;
  addFill('FFF8D7DA'); // đỏ/hồng nhạt — trả lời sai
  addFill('FFD9D9D9'); // xám — bỏ trống
  fillsEl.setAttribute('count', String(existingFillCount + 2));

  const cellXfsEl = doc.getElementsByTagNameNS(SML_NS, 'cellXfs')[0];
  const existingXfCount = cellXfsEl.getElementsByTagNameNS(SML_NS, 'xf').length;
  const addXf = (fillId: number) => {
    const xfEl = doc.createElementNS(SML_NS, 'xf');
    xfEl.setAttribute('numFmtId', '0');
    xfEl.setAttribute('fontId', '0');
    xfEl.setAttribute('fillId', String(fillId));
    xfEl.setAttribute('borderId', '0');
    xfEl.setAttribute('xfId', '0');
    xfEl.setAttribute('applyFill', '1');
    cellXfsEl.appendChild(xfEl);
  };
  const wrongStyleId = existingXfCount;
  const blankStyleId = existingXfCount + 1;
  addXf(wrongFillId);
  addXf(blankFillId);
  cellXfsEl.setAttribute('count', String(existingXfCount + 2));

  zip.file('xl/styles.xml', serialize(doc));
  return { wrong: wrongStyleId, blank: blankStyleId };
}

/** Gán style id (đã thêm ở addFillStyles) vào các ô câu trả lời sai/bỏ trống trên 1 sheet. */
async function applyCellFills(
  zip: JSZip,
  sheetPath: string,
  fills: CellFillInstruction[],
  styleIds: { wrong: number; blank: number },
): Promise<void> {
  if (fills.length === 0) return;
  const doc = await readXml(zip, sheetPath);
  const cellByRef = new Map<string, Element>();
  const cells = doc.getElementsByTagNameNS(SML_NS, 'c');
  for (let i = 0; i < cells.length; i++) {
    const ref = cells[i].getAttribute('r');
    if (ref) cellByRef.set(ref, cells[i]);
  }
  for (const fill of fills) {
    const cellEl = cellByRef.get(fill.cellRef);
    if (!cellEl) continue;
    cellEl.setAttribute('s', String(fill.kind === 'wrong' ? styleIds.wrong : styleIds.blank));
  }
  zip.file(sheetPath, serialize(doc));
}

function escapeXml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function buildChartXml(spec: DistributionChartSpec): string {
  const n = spec.categories.length;
  const sheetRef = `'${spec.sheetName.replace(/'/g, "''")}'`;
  const lastRow = spec.firstDataRow + n - 1;
  const catRange = `${sheetRef}!$A$${spec.firstDataRow}:$A$${lastRow}`;
  const valRange = `${sheetRef}!$B$${spec.firstDataRow}:$B$${lastRow}`;
  const catPts = spec.categories
    .map((c, i) => `<c:pt idx="${i}"><c:v>${escapeXml(c)}</c:v></c:pt>`)
    .join('');
  const valPts = spec.values.map((v, i) => `<c:pt idx="${i}"><c:v>${v}</c:v></c:pt>`).join('');

  return `${XML_HEADER}<c:chartSpace xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><c:chart><c:title><c:tx><c:rich><a:bodyPr/><a:lstStyle/><a:p><a:r><a:t>${escapeXml(spec.title)}</a:t></a:r></a:p></c:rich></c:tx><c:overlay val="0"/></c:title><c:autoTitleDeleted val="0"/><c:plotArea><c:layout/><c:barChart><c:barDir val="col"/><c:grouping val="clustered"/><c:varyColors val="0"/><c:ser><c:idx val="0"/><c:order val="0"/><c:tx><c:v>Số thí sinh</c:v></c:tx><c:cat><c:strRef><c:f>${catRange}</c:f><c:strCache><c:ptCount val="${n}"/>${catPts}</c:strCache></c:strRef></c:cat><c:val><c:numRef><c:f>${valRange}</c:f><c:numCache><c:formatCode>General</c:formatCode><c:ptCount val="${n}"/>${valPts}</c:numCache></c:numRef></c:val></c:ser><c:gapWidth val="50"/><c:axId val="111111111"/><c:axId val="222222222"/></c:barChart><c:catAx><c:axId val="111111111"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="0"/><c:axPos val="b"/><c:crossAx val="222222222"/></c:catAx><c:valAx><c:axId val="222222222"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="0"/><c:axPos val="l"/><c:crossAx val="111111111"/></c:valAx></c:plotArea><c:legend><c:legendPos val="b"/><c:overlay val="0"/></c:legend><c:plotVisOnly val="1"/></c:chart></c:chartSpace>`;
}

const DRAWING_XML = `${XML_HEADER}<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><xdr:twoCellAnchor><xdr:from><xdr:col>3</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>1</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from><xdr:to><xdr:col>13</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>22</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:to><xdr:graphicFrame macro=""><xdr:nvGraphicFramePr><xdr:cNvPr id="2" name="Bieu do pho diem"/><xdr:cNvGraphicFramePr/></xdr:nvGraphicFramePr><xdr:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/></xdr:xfrm><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/chart"><c:chart xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" r:id="rId1"/></a:graphicData></a:graphic></xdr:graphicFrame><xdr:clientData/></xdr:twoCellAnchor></xdr:wsDr>`;

const DRAWING_RELS_XML = `${XML_HEADER}<Relationships xmlns="${RELS_NS}"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/chart" Target="../charts/chart1.xml"/></Relationships>`;

function buildSheetRelsXml(): string {
  return `${XML_HEADER}<Relationships xmlns="${RELS_NS}"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing1.xml"/></Relationships>`;
}

/** Gắn 1 biểu đồ cột vào 1 sheet đã có sẵn (tham chiếu dữ liệu ngay trên chính sheet đó). */
async function attachDistributionChart(zip: JSZip, sheetPath: string, spec: DistributionChartSpec): Promise<void> {
  zip.file('xl/charts/chart1.xml', buildChartXml(spec));
  zip.file('xl/drawings/drawing1.xml', DRAWING_XML);
  zip.file('xl/drawings/_rels/drawing1.xml.rels', DRAWING_RELS_XML);

  const sheetRelsPath = sheetPath.replace('worksheets/', 'worksheets/_rels/') + '.rels';
  zip.file(sheetRelsPath, buildSheetRelsXml());

  const doc = await readXml(zip, sheetPath);
  const drawingEl = doc.createElementNS(SML_NS, 'drawing');
  drawingEl.setAttributeNS(OFFICE_REL_NS, 'r:id', 'rId1');
  doc.documentElement.appendChild(drawingEl);
  zip.file(sheetPath, serialize(doc));

  const ctDoc = await readXml(zip, '[Content_Types].xml');
  const addOverride = (partName: string, contentType: string) => {
    const el = ctDoc.createElementNS(CT_NS, 'Override');
    el.setAttribute('PartName', partName);
    el.setAttribute('ContentType', contentType);
    ctDoc.documentElement.appendChild(el);
  };
  addOverride('/xl/charts/chart1.xml', 'application/vnd.openxmlformats-officedocument.drawingml.chart+xml');
  addOverride('/xl/drawings/drawing1.xml', 'application/vnd.openxmlformats-officedocument.drawing+xml');
  zip.file('[Content_Types].xml', serialize(ctDoc));
}

export interface PostprocessOptions {
  detailSheetPath: string;
  detailFills: CellFillInstruction[];
  distributionSheetPath: string;
  distributionChart: DistributionChartSpec;
}

/** Hậu xử lý file .xlsx SheetJS đã ghi: tô màu ô sai/bỏ trống + gắn biểu đồ phổ điểm. */
export async function postprocessResultsWorkbook(baseBytes: Uint8Array, options: PostprocessOptions): Promise<Uint8Array> {
  const zip = await JSZip.loadAsync(baseBytes);

  const styleIds = await addFillStyles(zip);
  await applyCellFills(zip, options.detailSheetPath, options.detailFills, styleIds);
  await attachDistributionChart(zip, options.distributionSheetPath, options.distributionChart);

  // JSZip tự thêm entry thư mục (vd "xl/charts/") khi ghi file vào đường dẫn con mới — file .xlsx
  // gốc do SheetJS/Excel tạo không có các entry này, nên loại bỏ để bám sát cấu trúc chuẩn.
  // LƯU Ý: xóa trực tiếp qua zip.files (không dùng zip.remove() — với 1 thư mục nó xóa đệ quy
  // luôn cả nội dung bên trong, sẽ mất toàn bộ file vừa thêm).
  for (const path of Object.keys(zip.files)) {
    if (zip.files[path].dir) delete zip.files[path];
  }

  return zip.generateAsync({ type: 'uint8array' });
}
