import { onHandleData, log } from "../errorHandler";
import Report from "../report";

class SimpleLock {
    constructor() {
        this._locked = false;
        this._waiting = [];
    }

    async acquire() {
        while (this._locked) {
            await new Promise((resolve) => this._waiting.push(resolve));
        }
        this._locked = true;
    }

    release() {
        this._locked = false;
        if (this._waiting.length > 0) {
            const nextResolve = this._waiting.shift();
            nextResolve();
        }
    }
}

class DownFile {
    constructor(Http) {
        this.concurrentLimit = 3;
        this.progressCallback = null;
        this.chunkQueue = [];
        this.downloadedChunks = [];
        this.maxRetries = 3;
        this.failedChunks = [];
        this.report = new Report(Http);
        this.mimeType = "application/octet-stream";
        this.lock = new SimpleLock();
        this.paused = false; // 添加暂停状态
    }

    setProgressCallback(callback) {
        this.progressCallback = callback;
    }

    async checkUrl(url) {
        try {
            const response = await fetch(url, { method: "HEAD" });
            return response.ok;
        } catch (error) {
            log("Error checking URL:", error);
            return false;
        }
    }

    async downloadChunk(url, start, end, retries = 0) {
        try {
            const response = await fetch(url, {
                headers: {
                    Range: `bytes=${start}-${end}`,
                },
            });

            if (response.ok) {
                const chunkBlob = await response.blob();
                const expectedSize = end - start + 1;

                log(
                    `Downloading chunk ${start}-${end}: expected size ${expectedSize}, actual size ${chunkBlob.size}`
                );
                if (chunkBlob.size !== expectedSize) {
                    throw new Error(
                        `Chunk size mismatch: expected ${expectedSize}, but got ${chunkBlob.size}`
                    );
                }

                this.downloadedChunks.push({ start, blob: chunkBlob });
                this.mimeType = response.headers.get("Content-Type");
                return chunkBlob;
            } else {
                throw new Error(
                    `Failed to download chunk: ${start}-${end}, status: ${response.status}`
                );
            }
        } catch (error) {
            console.log(111, retries);
            if (retries < this.maxRetries) {
                log(
                    `Chunk download failed, retrying attempt ${retries + 1
                    } for chunk ${start}-${end}`
                );
                await new Promise((resolve) => setTimeout(resolve, 1000)); // Retry delay
                return this.downloadChunk(url, start, end, retries + 1);
            } else {
                // 达到最大重试次数时，记录失败块，并返回失败信息
                this.failedChunks.push({ start, end });

                // 返回失败结果，并阻止进一步下载
                return onHandleData({
                    code: StatusCodes.FAILURE,
                    msg: `Chunk download failed after ${this.maxRetries} attempts: ${start}-${end}`,
                });
            }
        }
    }

    async downloadFile(urls, traceId, assetCid, fileName, fileSize) {
        const chunkSize = Math.ceil(fileSize / urls.length);

        const uploadResults = [];
        try {
            const startTime = Date.now();
            await this.concurrentDownload(urls, fileSize, chunkSize);

            // 检查所有下载的块（chunk）是否完整
            const allChunksComplete = this.downloadedChunks.every((chunk, index) => {
                const expectedSize =
                    index < urls.length - 1 ? chunkSize : fileSize % chunkSize;
                return chunk.blob.size === expectedSize;
            });

            if (!allChunksComplete) {
                log(`Some chunks were incomplete. Retrying...`);
                await this.retryMissingChunks(this.failedChunks, urls);
            }

            const finalBlob = this.mergeChunks(this.downloadedChunks, this.mimeType);
            if (finalBlob.size !== fileSize) {
                throw new Error(
                    `File size mismatch: expected ${fileSize}, but got ${finalBlob.size}`
                );
            }

            // Create download link
            const downloadUrl = window.URL.createObjectURL(finalBlob);
            const a = document.createElement("a");
            a.href = downloadUrl;
            a.download = fileName;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(downloadUrl);
            document.body.removeChild(a);

            const endTime = Date.now();
            const elapsedTime = endTime - startTime;
            const transferRate = Math.floor((fileSize / elapsedTime) * 1000);

            urls.forEach((url) => {
                const parsedUrl = new URL(url);
                const nodeId = parsedUrl.hostname.split(".")[0];
                uploadResults.push({
                    status: 1,
                    msg: "successful",
                    elapsedTime: elapsedTime,
                    transferRate: transferRate,
                    size: fileSize,
                    traceId: traceId,
                    nodeId: nodeId,
                    cId: assetCid,
                    log: "",
                });
            });
            this.report.creatReportData(uploadResults, "download");
            return Promise.resolve({ code: 0, msg: "Download successful" });
        } catch (error) {
            // Handle error reporting
            urls.forEach((url) => {
                const parsedUrl = new URL(url);
                const nodeId = parsedUrl.hostname.split(".")[0];
                uploadResults.push({
                    status: -1,
                    msg: error.message,
                    elapsedTime: -1,
                    transferRate: -1,
                    size: fileSize,
                    traceId: traceId,
                    nodeId: nodeId,
                    cId: assetCid,
                    log: error.stack || "",
                });
            });
            this.report.creatReportData(uploadResults, "download");
            return onHandleData({
                code: StatusCodes.FAILURE,
                msg: "Download failed: " + error,
            });
        }
    }

    async concurrentDownload(urls, fileSize, chunkSize) {
        const availableUrls = urls.slice();
        let downloadedSize = 0;
        const totalChunks = Math.ceil(fileSize / chunkSize);

        for (let i = 0; i < totalChunks; i++) {
            const start = i * chunkSize;
            const end = Math.min(fileSize - 1, (i + 1) * chunkSize - 1);
            this.chunkQueue.push({ start, end });
        }

        const downloadQueue = [];
        const activeDownloads = new Array(availableUrls.length).fill(false);

        const updateProgress = () => {
            const percentage = Math.min(
                100,
                (downloadedSize / fileSize) * 100
            ).toFixed(2);
            if (this.progressCallback) {
                this.progressCallback(percentage);
            }
        };

        const downloadTask = async (url, urlIndex) => {
            while (true) {
                let chunk;
                await this.lock.acquire(); // Ensure proper locking
                if (this.chunkQueue.length > 0) {
                    chunk = this.chunkQueue.shift();
                }
                this.lock.release();

                if (!chunk) break;

                try {
                    const chunkBlob = await this.downloadChunk(
                        url,
                        chunk.start,
                        chunk.end
                    );
                    downloadedSize += chunkBlob.size;
                    updateProgress();
                } catch (error) {
                    log(
                        `Failed to download chunk ${chunk.start}-${chunk.end} from ${url}:`,
                        error
                    );
                }
            }
            activeDownloads[urlIndex] = false;
        };

        for (let i = 0; i < availableUrls.length; i++) {
            if (i < this.concurrentLimit) {
                activeDownloads[i] = true;
                downloadQueue.push(downloadTask(availableUrls[i], i));
            }
        }

        await Promise.all(downloadQueue);

      
    }

    async retryMissingChunks(failedChunks, urls) {
        console.log("失败的快", failedChunks);
        for (let chunk of failedChunks) {
            let success = false;
            for (let url of urls) {
                try {
                    log(`Re-download chunk ${chunk.start}-${chunk.end} from ${url}`);
                    const chunkBlob = await this.downloadChunk(
                        url,
                        chunk.start,
                        chunk.end
                    );
                    this.downloadedChunks.push({ start: chunk.start, blob: chunkBlob });
                    success = true;
                    break;
                } catch (error) {
                    log(
                        `Failed to re-download chunk ${chunk.start}-${chunk.end} from ${url}:`,
                        error
                    );
                }
            }
            if (!success) {
                log(
                    `Re-download chunk ${chunk.start}-${chunk.end} failed after all attempts.`
                );
            }
        }
    }

    mergeChunks(chunks, mimeType) {
        const sortedChunks = chunks.sort((a, b) => a.start - b.start);
        const mergedBlob = new Blob(
            sortedChunks.map((chunk) => chunk.blob),
            { type: mimeType }
        );
        return mergedBlob;
    }

}

export default DownFile;
