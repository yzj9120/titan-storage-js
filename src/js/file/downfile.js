import StatusCodes from "../codes";
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

class DownloadScheduler {
    constructor(urls, chunkSize) {
        this.urls = urls; // 下载的所有地址
        this.chunkSize = chunkSize; // 每个分片的大小
        this.chunkQueue = []; // 分片任务队列，存储未下载的分片
        this.failedChunks = []; // 存储下载失败的分片
        this.completedChunks = []; // 存储下载成功的分片
        this.totalSize = 0; // 总文件大小
        this.downloadedSize = 0; // 已下载的总大小
        this.urlStatus = {}; // 用于记录每个 URL 的状态

        // 初始化 URL 状态
        for (const url of this.urls) {
            const nodeId = this.getNodeId(url);
            this.urlStatus[nodeId] = { code: 0, msg: "" }; // 初始化状态，待下载
        }
    }

    // 初始化分片任务，根据文件大小分配分片
    initializeChunks(fileSize) {
        this.totalSize = fileSize; // 记录文件的总大小
        const totalChunks = Math.ceil(fileSize / this.chunkSize); // 计算总分片数量
        for (let i = 0; i < totalChunks; i++) {
            const start = i * this.chunkSize;
            const end = Math.min(fileSize - 1, (i + 1) * this.chunkSize - 1); // 分片范围
            this.chunkQueue.push({ start, end }); // 将分片任务加入队列
        }
    }

    // 更新已下载的大小
    updateDownloadedSize(chunkSize) {
        this.downloadedSize += chunkSize; // 累加已下载的大小
    }

    // 获取下载进度百分比
    getProgress() {
        return Math.floor((this.downloadedSize / this.totalSize) * 100); // 计算下载百分比
    }

    // 获取下一个需要下载的分片
    getNextChunk() {
        return this.chunkQueue.shift();
    }

    // 标记分片下载失败，将其存入失败队列
    markChunkFailed(chunk, url, error) {
        const nodeId = this.getNodeId(url);
        this.failedChunks.push(chunk);
        this.urlStatus[nodeId].code = 2; // 设置为失败状态
        this.urlStatus[nodeId].msg = `${error}`; // 更新失败消息
    }

    // 标记分片下载成功，将其存入成功队列
    markChunkCompleted(chunk, url) {
        const nodeId = this.getNodeId(url);
        this.completedChunks.push(chunk);
        this.urlStatus[nodeId].code = 1; // 设置为成功状态
        this.urlStatus[nodeId].msg = `completed`; // 更新成功消息
    }

    getNodeId(url) {
        const parsedUrl = new URL(url);
        const nodeId = parsedUrl.hostname.split(".")[0];

        return nodeId;
    }
    // 检查是否有失败的分片需要重试
    hasFailedChunks() {
        return this.failedChunks.length > 0;
    }

    // 检查是否所有分片已下载完成
    allChunksCompleted() {
        return this.completedChunks.length === Math.ceil(this.totalSize / this.chunkSize);
    }
    // 获取每个 URL 的状态
    getUrlStatus() {
        return Object.keys(this.urlStatus).map(nodeId => ({
            nodeId,
            code: this.urlStatus[nodeId].code,
            msg: this.urlStatus[nodeId].msg
        }));
    }
}

class DownFile {
    constructor(Http) {
        this.concurrentLimit = 3; // 最大并发数，限制同时下载的任务数量
        this.maxRetries = 3; // 每个分片的最大重试次数
        this.report = new Report(Http); // 用于记录下载进度等信息
        this.lock = new SimpleLock(); // 简单锁，用于控制任务的顺序和并发
        this.progressCallback = null; // 进度回调函数
        this.mimeType = "application/octet-stream";
    }

    // 设置进度更新的回调函数
    setProgressCallback(callback) {
        this.progressCallback = callback;
    }

    // 下载任务，下载单个分片并进行标记，同时更新进度
    async downloadTask(url, chunk, scheduler) {
        try {
            //  console.log(`开始下载分片: ${chunk.start}-${chunk.end} from ${url}`); // 输出开始下载的日志
            const { blob, size } = await this.downloadChunk(url, chunk.start, chunk.end); // 下载分片
            scheduler.markChunkCompleted({ start: chunk.start, blob }, url); // 标记分片成功
            scheduler.updateDownloadedSize(size); // 更新已下载的大小

            // console.log(`分片下载成功: ${chunk.start}-${chunk.end}, 大小: ${size}`); // 输出下载成功的日志

            // 计算下载进度并通过回调函数通知
            if (this.progressCallback) {
                const progress = scheduler.getProgress();
                this.progressCallback(progress);
            }
        } catch (error) {
            // console.error(`分片下载失败: ${chunk.start}-${chunk.end} from ${url}`, error); // 输出下载失败的日志
            scheduler.markChunkFailed(chunk, url, error); // 标记分片失败
        }
    }

    // 下载单个分片，如果失败则重试，最多重试 maxRetries 次
    async downloadChunk(url, start, end, retries = 0) {
        try {
            // console.log(`请求下载分片: ${start}-${end} from ${url}`); // 输出请求分片的日志
            const response = await fetch(url, {
                headers: {
                    Range: `bytes=${start}-${end}` // 使用 Range 请求分片
                }
            });

            // 如果请求失败，抛出错误进行捕获
            if (!response.ok) throw new Error(`Failed to download range ${start}-${end}`);
            const blob = await response.blob(); // 返回文件的 Blob 对象
            this.mimeType = response.headers.get("Content-Type");
            return { blob, size: end - start + 1 }; // 返回文件的 Blob 和大小
        } catch (error) {
            console.error(`下载分片失败: ${start}-${end}, 重试次数: ${retries}`, error); // 输出错误日志
            if (retries < this.maxRetries) {
                console.log(`正在重试分片下载: ${start}-${end} from ${url}, 重试次数: ${retries + 1}`); // 输出重试的日志
                return this.downloadChunk(url, start, end, retries + 1); // 重试下载
            } else {
                throw error; // 达到最大重试次数，抛出错误
            }
        }
    }

    // 主下载方法，下载文件并进行分片处理
    async downloadFile(urls, traceId, assetCid, fileName, fileSize) {
        const chunkSize = Math.ceil(fileSize / (urls.length * 3)); // 根据地址数量和限制的并发数分配分片大小
        const scheduler = new DownloadScheduler(urls, chunkSize); // 初始化调度器
        scheduler.initializeChunks(fileSize); // 初始化分片队列
        const uploadResults = [];
        let allCompleted = false;

        // 进行并行下载
        const activeUrls = urls.slice(); // 复制当前可用的 URL 列表
        const startTime = Date.now();
        // 循环直到所有分片都成功下载
        while (!allCompleted) {
            // 获取可以并行下载的分片
            while (scheduler.chunkQueue.length > 0) {
                const chunk = scheduler.getNextChunk(); // 获取下一个分片
                const url = activeUrls[Math.floor(Math.random() * activeUrls.length)]; // 随机选择一个 URL
                // 启动下载任务并立即处理 Promise
                this.downloadTask(url, chunk, scheduler).catch(error => {
                    console.error("下载任务出现错误:", error);
                    // 处理下载失败
                    scheduler.markChunkFailed(chunk, url); // 标记失败的分片
                });
            }

            // 等待所有当前的下载任务完成
            await new Promise(resolve => {
                const interval = setInterval(() => {
                    if (scheduler.allChunksCompleted()) {
                        clearInterval(interval);
                        resolve();
                    }
                }, 100); // 检查状态的间隔
            });

            // 检查是否有失败的分片
            if (scheduler.hasFailedChunks()) {
                for (const failedChunk of scheduler.failedChunks) {
                    // 随机重新分配地址下载失败的分片
                    const urlToRetry = activeUrls[Math.floor(Math.random() * activeUrls.length)];
                    try {
                        const { blob } = await this.downloadChunk(urlToRetry, failedChunk.start, failedChunk.end);
                        scheduler.markChunkCompleted({ start: failedChunk.start, blob }, urlToRetry);
                    } catch (error) {
                        console.error(`重新下载分片失败 ${failedChunk.start}-${failedChunk.end}`, error);
                    }
                }
                scheduler.failedChunks = []; // 清空失败分片队列
            }

            // 检查是否所有分片已成功下载
            allCompleted = scheduler.allChunksCompleted();
        }
        const endTime = Date.now();
        const elapsedTime = endTime - startTime;
        const transferRate = Math.floor((fileSize / elapsedTime) * 1000);
        // 所有分片下载完成后，合并文件
        const finalBlob = this.mergeChunks(scheduler.completedChunks, this.mimeType);

        if (finalBlob.size !== fileSize) {
            //throw new Error(`File size mismatch: expected ${fileSize}, but got ${finalBlob.size}`);
            scheduler.getUrlStatus().forEach((item) => {
                uploadResults.push({
                    status: 2,
                    msg: "failed",
                    elapsedTime: 0,
                    transferRate: 0,
                    size: fileSize,
                    traceId: traceId,
                    nodeId: item.nodeId,
                    cId: assetCid,
                    log: { [item.nodeId]: item.msg },
                });
            });
            return onHandleData({
                code: -1,
                msg: `File size mismatch: expected ${fileSize}, but got ${finalBlob.size}`
            });
        } else {
            scheduler.getUrlStatus().forEach((item) => {
                uploadResults.push({
                    status: 1,
                    msg: "successful",
                    elapsedTime: elapsedTime,
                    transferRate: transferRate,
                    size: fileSize,
                    traceId: traceId,
                    nodeId: item.nodeId,
                    cId: assetCid,
                    log: "",
                });
            });
        }

        this.saveFile(finalBlob, fileName); // 保存下载文件
        this.report.creatReportData(uploadResults, "download");
        return onHandleData({
            code: 0,
            msg: "File downloaded successfully "
        });
    }

    // 合并所有下载成功的分片


    mergeChunks(chunks, mimeType) {
        const sortedChunks = chunks.sort((a, b) => a.start - b.start);
        const mergedBlob = new Blob(sortedChunks.map(chunk => chunk.blob), { type: mimeType });
        return mergedBlob;
    }

    // 保存下载的文件
    saveFile(blob, fileName) {
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = fileName; // 设置下载文件的名字
        link.click(); // 开始下载
    }
}

export default DownFile;
