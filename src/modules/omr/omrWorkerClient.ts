import type { OmrTaskMessage, OmrResultMessage } from './types';

interface PendingEntry {
  resolve: (result: OmrResultMessage) => void;
  reject: (err: Error) => void;
}

/** Bọc Worker chạy OpenCV.js — khởi tạo trễ (chỉ khi vào luồng Chấm bài), giao tiếp qua taskId. */
export class OmrWorkerClient {
  private worker: Worker | null = null;
  private pending = new Map<string, PendingEntry>();
  private nextId = 0;

  private ensureWorker(): Worker {
    if (this.worker) return this.worker;
    const worker = new Worker(new URL('../../workers/omrProcess.worker.ts', import.meta.url), {
      type: 'module',
    });
    worker.onmessage = (event: MessageEvent<OmrResultMessage>) => {
      const msg = event.data;
      const entry = this.pending.get(msg.taskId);
      if (entry) {
        this.pending.delete(msg.taskId);
        entry.resolve(msg);
      }
    };
    worker.onerror = (event) => {
      const err = new Error(event.message || 'Worker OMR gặp lỗi không xác định');
      for (const entry of this.pending.values()) entry.reject(err);
      this.pending.clear();
    };
    this.worker = worker;
    return worker;
  }

  processSheet(bitmap: ImageBitmap, totalQuestions: number, maxOptions: number): Promise<OmrResultMessage> {
    const worker = this.ensureWorker();
    const taskId = `t${this.nextId++}`;
    const message: OmrTaskMessage = { taskId, bitmap, totalQuestions, maxOptions };
    return new Promise((resolve, reject) => {
      this.pending.set(taskId, { resolve, reject });
      worker.postMessage(message, [bitmap]);
    });
  }

  terminate(): void {
    this.worker?.terminate();
    this.worker = null;
    this.pending.clear();
  }
}
