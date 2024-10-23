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
    markChunkFailed(chunk) {
        this.failedChunks.push(chunk);
    }

    // 标记分片下载成功，将其存入成功队列
    markChunkCompleted(chunk) {
        this.completedChunks.push(chunk);
    }

    // 检查是否有失败的分片需要重试
    hasFailedChunks() {
        return this.failedChunks.length > 0;
    }

    // 检查是否所有分片已下载完成
    allChunksCompleted() {
        return this.completedChunks.length === Math.ceil(this.totalSize / this.chunkSize);
    }
}

class DownFile {
    constructor(Http) {
        this.concurrentLimit = 3; // 最大并发数，限制同时下载的任务数量
        this.maxRetries = 3; // 每个分片的最大重试次数
        this.report = new Report(Http); // 用于记录下载进度等信息
        this.lock = new SimpleLock(); // 简单锁，用于控制任务的顺序和并发
        this.progressCallback = null; // 进度回调函数
    }

    // 设置进度更新的回调函数
    setProgressCallback(callback) {
        this.progressCallback = callback;
    }

    // 下载任务，下载单个分片并进行标记，同时更新进度
    async downloadTask(url, chunk, scheduler) {
       // await this.lock.acquire(); // 获取锁，确保资源访问的顺序性
        try {
            console.log(`开始下载分片: ${chunk.start}-${chunk.end} from ${url}`); // 输出开始下载的日志
            const { blob, size } = await this.downloadChunk(url, chunk.start, chunk.end); // 下载分片
            scheduler.markChunkCompleted({ start: chunk.start, blob }); // 标记分片成功
            scheduler.updateDownloadedSize(size); // 更新已下载的大小

            console.log(`分片下载成功: ${chunk.start}-${chunk.end}, 大小: ${size}`); // 输出下载成功的日志

            // 计算下载进度并通过回调函数通知
            if (this.progressCallback) {
                const progress = scheduler.getProgress();
                this.progressCallback(progress);
            }
        } catch (error) {
            console.error(`分片下载失败: ${chunk.start}-${chunk.end} from ${url}`, error); // 输出下载失败的日志
            scheduler.markChunkFailed(chunk); // 标记分片失败
        } finally {
            //this.lock.release(); // 释放锁
        }
    }

    // 下载单个分片，如果失败则重试，最多重试 maxRetries 次
    async downloadChunk(url, start, end, retries = 0) {
        try {
            console.log(`请求下载分片: ${start}-${end} from ${url}`); // 输出请求分片的日志
            const response = await fetch(url, {
                headers: {
                    Range: `bytes=${start}-${end}` // 使用 Range 请求分片
                }
            });

            // 如果请求失败，抛出错误进行捕获
            if (!response.ok) throw new Error(`Failed to download range ${start}-${end}`);
            const blob = await response.blob(); // 返回文件的 Blob 对象
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
        const chunkSize = Math.ceil(fileSize / urls.length); // 根据地址数量分配分片大小
        const scheduler = new DownloadScheduler(urls, chunkSize); // 初始化调度器
        scheduler.initializeChunks(fileSize); // 初始化分片队列

        let allCompleted = false;

        // 进行并行下载
        const downloadTasks = []; // 存储当前的下载任务
        const activeUrls = urls.slice(); // 复制当前可用的 URL 列表

        // 循环直到所有分片都成功下载
        while (!allCompleted) {
            console.log(111,allCompleted)
            // 获取可以并行下载的分片
            while (downloadTasks.length < this.concurrentLimit && scheduler.chunkQueue.length > 0) {
             
                const chunk = scheduler.getNextChunk(); // 获取下一个分片
                console.log(222,chunk)

                const url = activeUrls[Math.floor(Math.random() * activeUrls.length)]; // 随机选择一个 URL
                downloadTasks.push(this.downloadTask(url, chunk, scheduler)); // 启动下载任务
            }

            // 等待所有当前的下载任务完成
            await Promise.all(downloadTasks).catch(error => {
                console.error("并行下载任务出现错误:", error);
            });

            // 检查是否有失败的分片
            if (scheduler.hasFailedChunks()) {
                for (const failedChunk of scheduler.failedChunks) {
                    // 随机重新分配地址下载失败的分片
                    const urlToRetry = activeUrls[Math.floor(Math.random() * activeUrls.length)];
                    try {
                        const { blob } = await this.downloadChunk(urlToRetry, failedChunk.start, failedChunk.end);
                        scheduler.markChunkCompleted({ start: failedChunk.start, blob });
                    } catch (error) {
                        console.error(`Failed to re-download chunk ${failedChunk.start}-${failedChunk.end}`, error);
                    }
                }
                scheduler.failedChunks = []; // 清空失败分片队列
            }

            // 检查是否所有分片已成功下载
            allCompleted = scheduler.allChunksCompleted();
            downloadTasks.length = 0; // 清空当前任务列表
        }

        // 所有分片下载完成后，合并文件
        const finalBlob = this.mergeChunks(scheduler.completedChunks); // 合并所有成功下载的分片
        this.saveFile(finalBlob, fileName); // 保存下载文件

        return { success: true, message: 'File downloaded successfully!' };
    }

    // 合并所有下载成功的分片
    mergeChunks(chunks) {
        // 按顺序合并分片
        const blobs = chunks.sort((a, b) => a.start - b.start).map(chunk => chunk.blob);
        return new Blob(blobs); // 返回合并后的 Blob
    }

    // 保存下载的文件
    saveFile(blob, fileName) {
        const url = URL.createObjectURL(blob); // 创建 URL 对象
        const a = document.createElement('a'); // 创建下载链接
        a.href = url; // 设置链接地址
        a.download = fileName; // 设置文件名
        document.body.appendChild(a); // 将链接添加到文档
        a.click(); // 触发下载
        document.body.removeChild(a); // 下载后移除链接
        URL.revokeObjectURL(url); // 释放 URL 对象
    }
}

export default DownFile;