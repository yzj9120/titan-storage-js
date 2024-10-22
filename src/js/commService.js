import { log, onHandleData } from "./errorHandler";
import StatusCodes from "./codes";
import { Validator } from "./validators";
import HttpService from "./httpService";

import UploadLoader from "./file/uploadLoader";
import FolderLoader from "./file/folderLoader";
import DownFolder from "./file/downfolder"
import DownFile from "./file/downfile"

import ShareLoader from "./shareLoader"; // 导入 ShareLoader

class CommService {
  constructor(Http) {
    this.Http = Http;
    this.httpService = new HttpService(Http); // 使用 Ht
  }

  /**
   * 更新 Http 请求的 API key
   * @param {string} newToken - 新的 API key
   */
  updateToken(newToken) {
    if (typeof newToken === "string" && newToken.trim().length > 0) {
      this.Http.updateToken(newToken);
    } else {
      return onHandleData({
        code: StatusCodes.BAD_REQUEST,
        msg: "Invalid API token provided.",
      });
    }
  }

  async updateLanguage(language) {
    try {
      const data = this.Http.updateLanguage(language);
      return data;
    } catch (error) {
      return onHandleData({
        code: StatusCodes.FAILURE,
        msg: error,
      });
    }
  }

  /**
   * Retrieves the area ID.
   * @returns {Promise<Object>} Area ID data.
   */
  async onAreaId() {
    try {
      return await this.httpService.getAreaIdList();
    } catch (error) {
      return onHandleData({
        code: StatusCodes.INTERNAL_SERVER_ERROR,
        msg: "Failed to get area ID: " + error,
      });
    }
  }

  /**
   * Creates a group with the specified name and parent ID.
   * @param {string} name - The name of the group.
   * @param {number} parent - The parent ID of the group.
   * @returns {Promise<Object>} Result of the group creation.
   */
  async onCreateGroup(name, parent) {
    try {
      var validator = Validator.validateGroupName(name);
      if (validator) {
        log(validator);
        return validator;
      }

      var validator2 = Validator.validateParentId(parent);
      if (validator2) {
        log(validator2);
        return validator;
      }
      return await this.httpService.createGroup(name, parent);
    } catch (error) {
      return onHandleData({
        code: StatusCodes.INTERNAL_SERVER_ERROR,
        msg: "Failed to create group: " + error,
      });
    }
  }

  /**
   * Retrieves a list of asset groups with pagination.
   * @param {number} page - The page number.
   * @param {number} parent - The parent ID.
   * @param {number} pageSize - The number of items per page.
   * @returns {Promise<Object>} Asset group list data.
   */
  async onAssetGroupList(page, parent, pageSize) {
    try {
      var validateParentId = Validator.validateParentId(parent);
      if (validateParentId) {
        log(validateParentId);
        return validateParentId;
      }
      var validatePage = Validator.validatePage(page);
      if (validatePage) {
        log(validatePage);
        return validatePage;
      }

      var validatePageSize = Validator.validatePageSize(pageSize);
      if (validatePageSize) {
        log(validatePageSize);
        return validatePageSize;
      }

      return await this.httpService.onAssetGroupList(page, parent, pageSize);
    } catch (error) {
      return onHandleData({
        code: StatusCodes.INTERNAL_SERVER_ERROR,
        msg: "Failed to asset list: " + error,
      });
    }
  }

  /**
   * Renames a group.
   * @param {Object} options - Options for renaming the group.
   * @param {number} options.groupId - The ID of the group to rename.
   * @param {string} options.name - The new name for the group.
   * @returns {Promise<Object>} Result of the rename operation.
   */
  async renameGroup(options = { groupId: -1, name: "" }) {
    try {
      var validateGroupName = Validator.validateGroupName(options.name);
      if (validateGroupName) {
        log(validateGroupName);
        return validateGroupName;
      }

      const validateGroupId = Validator.validateGroupId(options.groupId);
      if (validateGroupId) return validateGroupId;

      return await this.httpService.renameGroup(options);
    } catch (error) {
      return onHandleData({
        code: StatusCodes.INTERNAL_SERVER_ERROR,
        msg: "Failed to rename group: " + error,
      });
    }
  }

  /**
   * Renames an asset.
   * @param {Object} options - Options for renaming the asset.
   * @param {number} options.assetId - The ID of the asset to rename.
   * @param {string} options.name - The new name for the asset.
   * @returns {Promise<Object>} Result of the rename operation.
   */
  async renameAsset(options = { assetId: -1, name: "" }) {
    try {
      var validateGroupName = Validator.validateGroupName(options.name);
      if (validateGroupName) {
        log(validateGroupName);
        return validateGroupName;
      }
      var validateAssetCid = Validator.validateAssetCid(options.assetId);
      if (validateAssetCid) {
        return validateAssetCid;
      }

      return await this.httpService.renameAsset(options);
    } catch (error) {
      return onHandleData({
        code: StatusCodes.INTERNAL_SERVER_ERROR,
        msg: "Failed to rename asset: " + error,
      });
    }
  }

  /**
   * Deletes a group.
   * @param {Object} options - Options for deleting the group.
   * @param {number} options.groupId - The ID of the group to delete.
   * @returns {Promise<Object>} Result of the delete operation.
   */
  async deleteGroup(options = { groupId: -1 }) {
    try {
      const validateGroupId = Validator.validateGroupId(options.groupId);
      if (validateGroupId) return validateGroupId;

      return await this.httpService.deleteGroup(options);
    } catch (error) {
      return onHandleData({
        code: StatusCodes.INTERNAL_SERVER_ERROR,
        msg: "Failed to delete group: " + error,
      });
    }
  }

  /**
   * Deletes an asset.
   * @param {Object} options - Options for deleting the asset.
   * @param {number} options.assetId - The ID of the asset to delete.
   * @param {Array<number>} options.areaId - Array of area IDs to delete assets from, or empty to delete from all areas.
   * @returns {Promise<Object>} Result of the delete operation.
   */
  async deleteAsset(options = { assetId: -1, areaId: [] }) {
    try {
      if (options.assetId === -1) {
        return onHandleData({
          code: StatusCodes.ID_KEY_EMPTY,
          msg: "Asset ID is required",
        });
      }
      return await this.httpService.deleteAsset(options);
    } catch (error) {
      return onHandleData({
        code: StatusCodes.INTERNAL_SERVER_ERROR,
        msg: "Failed to delete asset: " + error,
      });
    }
  }
  async getAssetGroupInfo(options = { cId: -1, groupId: -1 }) {
    try {
      if (options.cId === -1 && options.groupId === -1) {
        return onHandleData({
          code: StatusCodes.ID_KEY_EMPTY,
          msg: "At least one ID (cId or groupId) is required",
        });
      }
      return await this.httpService.getAssetGroupInfo(options);
    } catch (error) {
      return onHandleData({
        code: StatusCodes.INTERNAL_SERVER_ERROR,
        msg: "" + error,
      });
    }
  }

  /**
   * Retrieves user-related information.
   * @returns {Promise<Object>} Combined user information.
   */
  async userInfo() {
    try {
      return await this.httpService.userInfo();
    } catch (error) {
      return onHandleData({
        code: StatusCodes.INTERNAL_SERVER_ERROR,
        msg: "Failed to retrieve user information: " + error,
      });
    }
  }
  async onShare(
    options = {
      id: null,
      expireAt: null,
      shortPass: "",
      hasDay: false,
      hasDomain: true,
    }
  ) {
    try {
      const shareLoader = new ShareLoader(this.httpService); // 实例化 ShareLoader
      return shareLoader.onShare(options); // 调用 ShareLoader 中的 onShare 方法
    } catch (error) {
      return onHandleData({
        code: StatusCodes.INTERNAL_SERVER_ERROR,
        msg: "" + error,
      });
    }
  }

  /**
   * 处理文件上传逻辑
   * @param {File} file - 要上传的文
   * @param {*} options.areaId  区域标识，非必填；默认为空。 当为空时系统根据规则自动分发文件至全球区域，不为空时：上传待指定的区域
   * @param {*} options.groupId 节点ID：非必填，默认0。表示上传到根节点。如果需要上传到其他节点需要获取Group下的ID，如Group.ID ; 如果为-1 ：则表示在外部上传，准许上传文件最大100M
   *  @param {*} options.assetType  文件类型：非必填：默认 0 。0:文件，1:文件夹
   *  @param {*} options.extraId 外部通知ID：非必填，
   *  @param {*} options.retryCount 重试次数 ：非必填。默认上传失败重试2次
   * @returns {Promise<Object>} 上传结果
   */

  async onFileUpload(
    file,
    assetData = {
      areaId: [],
      groupId: 0,
      assetType: 0,
      extraId: "",
      retryCount: 3,
    },
    onProgress,
    onStreamStatus
  ) {
    const validationResult = Validator.validateUploadOptions(
      file,
      assetData.areaId,
      assetData.groupId,
      assetData.assetType
    );
    if (validationResult) return validationResult; // 返回验证失败信息

    if (assetData.assetType === 0) {
      ///文件
      this.uploadLoader = new UploadLoader(this.httpService);
      return await this.uploadLoader.onFileUpload(
        file,
        assetData,
        onProgress,
        onStreamStatus
      );
    } else if (assetData.assetType === 1) {
      //文件夹
      this.folderLoader = new FolderLoader(this.httpService);
      return await this.folderLoader.handleFolderUpload(
        file,
        assetData,
        onProgress,
        onStreamStatus
      );
    } else {
      return onHandleData({
        code: StatusCodes.Asset_Type_ERROR,
      });
    }
  }
  ///下载
  async onFileDown(
    options = {
      areaId: "",
      assetCid: "",
      assetType: "",
      userId: "",
      hasTempFile: false,
      tempFileName: "",
      fileSize: 0,
    },
    onProgress
  ) {
    const {
      assetCid,
      assetType,
      userId,
      areaId,
      hasTempFile,
      tempFileName,
      fileSize,
    } = options;

    const validateAssetCid = Validator.validateAssetCid(assetCid);
    if (validateAssetCid) return validateAssetCid;

    const res = await this.httpService.getFileDownURL({ assetCid, userId, areaId, hasTempFile });

    if (res.code === 0) {
      const urls = res.data.url;
      function getFileNameFromUrl(url) {
        const urlObj = new URL(url);
        const params = new URLSearchParams(urlObj.search);
        return params.get("filename"); // 获取 'filename' 参数的值
      }
      var fileName = getFileNameFromUrl(urls[0]);
      if (!fileName) {
        fileName = tempFileName;
      }

      const filesize = res.data.size ?? fileSize;
      const traceId = res.data.trace_id;

      // 实例化 Downloader
      if (assetType == "folder") {
        const downloader = new DownFolder(this.httpService);
      
        var downresult = await downloader.downloadFromMultipleUrls(
          urls,
          traceId,
          assetCid,
          fileName,
          filesize,
          onProgress
        );


        return downresult;
      } else if (assetType == "file") {

        console.log("urls", urls.length);


        const downloader = new DownFile(this.httpService);
        downloader.setProgressCallback((progress) => {
          if (onProgress) {
            onProgress(progress); // 将进度反馈给调用者
          }
        });
        // 开始下载文件
        var downresult = await downloader.downloadFile(
          urls,
          traceId,
          assetCid,
          fileName,
          filesize
        );
        log("downresult.file", downresult);
        return downresult;
      } else {
        return onHandleData({
          code: StatusCodes.Dowload_Type_ERROR,
          msg: "Failed to downresult: ",
        });
      }
    } else {
      return res;
    }
  }
}

export default CommService;
