/** 0->A, 1->B, ..., 25->Z. Dùng chung cho parser, trộn đề, in đề, phiếu trả lời và OMR. */
export function letterAt(index: number): string {
  return String.fromCharCode(65 + index);
}

/** Chiều ngược lại của letterAt: "A"->0, "B"->1, ... */
export function indexOfLetter(letter: string): number {
  return letter.charCodeAt(0) - 65;
}
