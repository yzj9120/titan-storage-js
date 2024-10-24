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
        log(`totalChunks: ${totalChunks}`); // 输出总分片数量
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

    // 检查是否有失败的分片需要重试
    hasFailedChunks() {
        return this.failedChunks.length > 0;
    }

    // 检查是否所有分片已下载完成
    allChunksCompleted() {
        return (
            this.completedChunks.length === Math.ceil(this.totalSize / this.chunkSize)
        );
    }
    // 获取每个 URL 的状态
    getUrlStatus() {
        return Object.keys(this.urlStatus).map((nodeId) => ({
            nodeId,
            code: this.urlStatus[nodeId].code,
            msg: this.urlStatus[nodeId].msg,
        }));
    }
    getNodeId(url) {
        const parsedUrl = new URL(url);
        const nodeId = parsedUrl.hostname.split(".")[0];
        return nodeId;
    }
}

class DownFile {
    constructor(Http) {
        this.maxConcurrentDownloads = 10; // 最大并发数，限制同时下载的任务数量
        this.maxRetries = 0; // 每个分片的最大重试次数
        this.report = new Report(Http); // 用于记录下载进度等信息
        this.lock = new SimpleLock(); // 简单锁，用于控制任务的顺序和并发
        this.progressCallback = null; // 进度回调函数
        this.urlStats = {}; // 用于追踪每个 URL 的成功和失败次数
        this.mimeType = "application/octet-stream";
        this.hasSuccessfulUrl = true;

    }
    // 模拟计算系统负载的方法
    calculateSystemLoad() {
        // 这里可以根据实际情况计算系统负载，这里用随机数模拟
        return Math.floor(Math.random() * 100); // 返回 0 到 99 的随机数
    }

    // 调整并发下载数量
    adjustConcurrency() {
        const load = this.calculateSystemLoad();
        if (load > 80 && this.maxConcurrentDownloads > 1) {
            this.maxConcurrentDownloads -= 1; // 减少并发下载数
            //console.log(`降低并发下载数量: ${this.maxConcurrentDownloads}`);
        } else if (load < 50 && this.maxConcurrentDownloads < 20) {
            this.maxConcurrentDownloads += 1; // 增加并发下载数
            //console.log(`增加并发下载数量: ${this.maxConcurrentDownloads}`);
        }
    }

    setProgressCallback(callback) {
        this.progressCallback = callback;
    }

    // 初始化 URL 统计
    initializeUrlStats(urls) {
        urls.forEach((url) => {
            this.urlStats[url] = { success: 0, failure: 0 };
        });
    }

    // 检查 URL 的可用性
    async checkUrlAvailability(url) {
        // return true;
        try {
            const response = await fetch(url, { method: "HEAD" });
            return response.ok;
        } catch (error) {
            return false;
        }
    }
    // 根据 URL 的成功率获取最佳下载地址
    getBestUrl() {
        let bestUrl = null;
        let bestSuccessRate = -1;

        for (const [url, { success, failure }] of Object.entries(this.urlStats)) {
            const total = success + failure;
            const successRate = total === 0 ? 0 : success / total;

            if (successRate > bestSuccessRate) {
                bestSuccessRate = successRate;
                bestUrl = url;
            }
        }
        return bestUrl; // 返回成功率最高的 URL
    }
    // 下载任务，下载单个分片并进行标记，同时更新进度
    async downloadTask(url, chunk, scheduler) {
        try {
            log(`Start downloading chunk: ${chunk.start}-${chunk.end} from ${url}`); // 输出开始下载的日志
            const { blob, size } = await this.downloadChunk(url, chunk.start, chunk.end); // 下载分片
            if (!blob) {
                this.urlStats[url].failure++; // 记录失败下载
                const err = `Chunk ${chunk.start}-${chunk.end} failed to download.`
                //scheduler.markChunkFailed(chunk, url, err); // 标记分片失败
                throw new Error(err);
            }
            scheduler.markChunkCompleted({ start: chunk.start, blob }, url); // 标记分片成功
            scheduler.updateDownloadedSize(size); // 更新已下载的大小
            log(
                `Chunk downloaded successfully: ${chunk.start}-${chunk.end}, size: ${size}`
            ); // 输出下载成功的日志
            this.urlStats[url].success++; // 记录成功下载
            // 计算下载进度并通过回调函数通知
            if (this.progressCallback) {
                const progress = scheduler.getProgress();
                this.progressCallback(progress);
            }

        } catch (error) {
            log(
                `Failed to downloadTask chunk: ${chunk.start}-${chunk.end} from ${url}`,
                error
            ); // 输出下载失败的日志
            scheduler.markChunkFailed(chunk, url, error); // 标记分片失败
            this.urlStats[url].failure++; // 记录失败下载

        }
    }



    // 下载单个分片，如果失败则重试，最多重试 maxRetries 次
    async downloadChunk(url, start, end, retries = 0) {
        try {
            log(`Requesting to download chunk: ${start}-${end} from ${url}`); // 输出请求分片的日志
            const response = await fetch(url, {
                headers: {
                    Range: `bytes=${start}-${end}`, // 使用 Range 请求分片
                },
            });
            // 如果请求失败，抛出错误进行捕获
            if (!response.ok) {
                throw new Error(`Failed to download range ${start}-${end}`);
            }
            const blob = await response.blob();
            this.mimeType = response.headers.get("Content-Type");
            return { blob, size: end - start + 1 }; // 返回文件的 Blob 和大小
        } catch (error) {
            log(`Failed to download chunk: ${start}-${end}, retry`); // 输出错误日志
            // if (retries < this.maxRetries) {
            //     log(
            //         `Retrying to download chunk: ${start}-${end} from ${url}, retry times: ${retries + 1
            //         }`
            //     ); // 输出重试的日志
            //     await new Promise((resolve) => setTimeout(resolve, 1000)); // 延迟 1 秒后重试
            //     return this.downloadChunk(url, start, end, retries + 1); // 重试下载
            // }
            const hasSuccess = Object.values(this.urlStats).some(stat => stat.success > 0);
            if (hasSuccess) {
                //console.log('存在 success 大于 0 的条目');
                throw new Error(`Failed to download range ${start}-${end}`)
            } else {
                //console.log('不存在 success 大于 0 的条目');
                return {
                    blob: null,
                    size: 0,
                    error: `Failed: ${start}-${end}: ${error.message}`,
                }; // 返回错误信息到上一级
            }
        }
    }

    // 主下载方法，下载文件并进行分片处理
    async downloadFile(urls, traceId, assetCid, fileName, fileSize) {
        this.initializeUrlStats(urls); // 初始化 URL 统计
        const chunkSize = Math.min(
            1024 * 1024,
            Math.ceil(fileSize / (urls.length * 5))
        );
        const scheduler = new DownloadScheduler(urls, chunkSize);
        scheduler.initializeChunks(fileSize);

        // 检查每个 URL 的可用性
        const availableUrls = [];
        const uploadResults = [];
        for (const url of urls) {
            const isAvailable = await this.checkUrlAvailability(url);
            if (isAvailable) {
                availableUrls.push(url); // 仅将可用的 URL 添加到列表中
            }
        }

        if (availableUrls.length === 0) {
            return onHandleData({
                code: -1,
                msg: "URL downloaded error ",
            });
        }

        let allCompleted = false;

        // 进行并行下载
        const downloadTasks = []; // 存储当前的下载任务
        const activeUrls = availableUrls.slice(); // 使用可用的 URL 列表
        const startTime = Date.now();
        this.adjustConcurrency();
        // 循环直到所有分片都成功下载
        while (!allCompleted) {
            // 获取可以并行下载的分片
            while (scheduler.chunkQueue.length > 0 && downloadTasks.length < this.maxConcurrentDownloads) {
                const chunk = scheduler.getNextChunk(); // 获取下一个分片
                const url = activeUrls[Math.floor(Math.random() * activeUrls.length)]; // 随机选择一个 URL
                downloadTasks.push(this.downloadTask(url, chunk, scheduler)); // 启动下载任务
            }
            // 等待所有当前的下载任务完成
            try {
                var res = await Promise.all(downloadTasks);
            } catch (error) {
                // 如果 Promise.all 抛出错误，说明所有下载任务失败
                log("All download tasks failed. Exiting.");
                scheduler.failedChunks = [];
                break;
            }
            // 检查是否有失败的分片
            if (scheduler.hasFailedChunks()) {
                for (const failedChunk of scheduler.failedChunks) {
                    // 选择最佳的 URL 重新下载失败的分片
                    const urlToRetry = this.getBestUrl();
                    if (!urlToRetry) {
                        // 如果没有可用的 URL，记录错误并返回
                        return onHandleData({
                            code: -1,
                            msg: `All available URLs failed to download ${failedChunk.start}-${failedChunk.end}  cannot be retried`,
                        });
                    }
                    try {
                        const { blob } = await this.downloadChunk(
                            urlToRetry,
                            failedChunk.start,
                            failedChunk.end
                        );
                        scheduler.markChunkCompleted({ start: failedChunk.start, blob }, urlToRetry);
                    } catch (error) {
                        log(
                            `Failed to re-download chunk ${failedChunk.start}-${failedChunk.end}`,
                            error
                        );
                        break;
                    }
                }
                scheduler.failedChunks = []; // 清空失败分片队列
            }
            // 检查是否所有分片已成功下载
            allCompleted = scheduler.allChunksCompleted();
            downloadTasks.length = 0; // 清空当前任务列表
        }
        const endTime = Date.now();
        const elapsedTime = endTime - startTime;
        const transferRate = Math.floor((fileSize / elapsedTime) * 1000);
        // 所有分片下载完成后，合并文件
        const finalBlob = this.mergeChunks(scheduler.completedChunks, this.mimeType);
        if (finalBlob.size !== fileSize) {
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
            this.report.creatReportData(uploadResults, "download");
            return onHandleData({
                code: -1,
                msg: `Failed to download chunk`,
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
            this.saveFile(finalBlob, fileName); // 保存下载文件
            this.report.creatReportData(uploadResults, "download");
            return onHandleData({
                code: 0,
                msg: "File downloaded successfully ",
            });
        }
    }

    // 合并所有下载成功的分片
    mergeChunks(chunks, mimeType) {
        const sortedChunks = chunks.sort((a, b) => a.start - b.start);
        const mergedBlob = new Blob(
            sortedChunks.map((chunk) => chunk.blob),
            { type: mimeType }
        );
        return mergedBlob;
    }

    // 保存下载的文件
    saveFile(blob, fileName) {
        const url = URL.createObjectURL(blob); // 创建 URL 对象
        const a = document.createElement("a"); // 创建下载链接
        a.href = url; // 设置链接地址
        a.download = fileName; // 设置文件名
        document.body.appendChild(a); // 将链接添加到文档
        a.click(); // 触发下载
        document.body.removeChild(a); // 下载后移除链接
        URL.revokeObjectURL(url); // 释放 URL 对象
    }
}

export default DownFile;
