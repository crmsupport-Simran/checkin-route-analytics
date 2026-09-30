export function parseReport(file, onProgress = () => {}) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./reportWorker.js', import.meta.url), { type: 'module' });
    const reader = new FileReader();
    reader.onprogress = (event) => { if (event.lengthComputable) onProgress({ stage: 'Reading file...', progress: Math.min(30, Math.round(event.loaded / event.total * 30)) }); };
    reader.onerror = () => { worker.terminate(); reject(new Error('The selected file could not be read.')); };
    reader.onload = () => worker.postMessage({ fileBuffer: reader.result }, [reader.result]);
    worker.onmessage = ({ data }) => { if (data.error) { worker.terminate(); reject(new Error(data.error)); } else if (data.result) { worker.terminate(); resolve(data.result); } else onProgress(data); };
    reader.readAsArrayBuffer(file);
  });
}
