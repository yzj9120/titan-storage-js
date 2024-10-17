import { Http } from "./http";
import { log, onHandleData } from "./errorHandler";
import StatusCodes from "./codes";
import { Validator } from "./validators";

import Downloader from "./downloader";
import UploadLoader from "./uploadLoader";
import ShareLoader from "./shareLoader"; // 导入 ShareLoader

class CommService {
  constructor(Http) {
    this.Http = Http;
  }

  /**
   * 更新 Http 请求的 API key
   * @param {string} newToken - 新的 API key
   */
  updateToken(newToken) {
    if (typeof newToken === "string" && newToken.trim().length > 0) {
      this.Http.updateToken(newToken);
    } else {
      return onHandleData({ code: StatusCodes.BAD_REQUEST, msg: "Invalid API token provided." });
    }
  }

  /**
   * Retrieves the area ID.
   * @returns {Promise<Object>} Area ID data.
   */
  async onAreaId() {
    try {
      return await this.Http.getData("/api/v1/storage/get_area_id");
    } catch (error) {
      return onHandleData({ code: StatusCodes.INTERNAL_SERVER_ERROR, msg: "Failed to get area ID: " + error });
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
      return await this.Http.getData(
        `/api/v1/storage/create_group?name=${encodeURIComponent(
          name
        )}&parent=${parent}`
      );
    } catch (error) {
      return onHandleData({ code: StatusCodes.INTERNAL_SERVER_ERROR, msg: "Failed to create group: " + error });
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

      return await this.Http.getData(
        `/api/v1/storage/get_asset_group_list?page=${page}&parent=${parent}&page_size=${pageSize}`
      );
    } catch (error) {
      return onHandleData({ code: StatusCodes.INTERNAL_SERVER_ERROR, msg: "Failed to asset list: " + error });
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

      const body = {
        group_id: options.groupId,
        new_name: options.name,
      };

      const data = await this.Http.postData(
        "/api/v1/storage/rename_group",
        body
      );
      log("TitanSDK:renameGroup:", data);
      return data;
    } catch (error) {
      return onHandleData({ code: StatusCodes.INTERNAL_SERVER_ERROR, msg: "Failed to rename group: " + error });
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

      const body = {
        asset_cid: options.assetId,
        new_name: options.name,
      };

      const data = await this.Http.postData(
        "/api/v1/storage/rename_group",
        body
      );
      log("TitanSDK:renameAsset:", data);
      return data;
    } catch (error) {
      return onHandleData({ code: StatusCodes.INTERNAL_SERVER_ERROR, msg: "Failed to rename asset: " + error });
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

      const data = await this.Http.getData(
        `/api/v1/storage/delete_group?group_id=${options.groupId}`
      );
      log("TitanSDK:deleteGroup:", data);
      return data;
    } catch (error) {
      return onHandleData({ code: StatusCodes.INTERNAL_SERVER_ERROR, msg: "Failed to delete group: " + error });
    }
  }

  async getAssetGroupInfo(options = { cId: -1, groupId: -1 }) {
    try {


      if (options.cId === -1 && options.groupId === -1) {
        return onHandleData({ code: StatusCodes.ID_KEY_EMPTY, msg: "At least one ID (cId or groupId) is required" });
      }


      if (options.cId) {
        const data = await this.Http.getData(
          `/api/v1/storage/get_asset_group_info?cid=${options.cId}`
        );
        log("TitanSDK:getAssetGroupInfo:", data);
        return data;
      } else if (options.groupId) {
        const data = await this.Http.getData(
          `/api/v1/storage/get_asset_group_info?groupid=${options.groupId}`
        );
        log("TitanSDK:getAssetGroupInfo:", data);
        return data;
      }
    } catch (error) {
      return onHandleData({ code: StatusCodes.INTERNAL_SERVER_ERROR, msg: "" + error });
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
        return onHandleData({ code: StatusCodes.ID_KEY_EMPTY, msg: "Asset ID is required" });
      }
      let url = `/api/v1/storage/delete_asset?asset_cid=${options.assetId}`;
      if (options.areaId && options.areaId.length > 0) {
        const areaIdParams = options.areaId
          .map((id) => `area_id=${encodeURIComponent(id)}`)
          .join("&");
        url += `&${areaIdParams}`;
      }

      const data = await this.Http.getData(url);
      log("TitanSDK:deleteAsset:", data);
      return data;
    } catch (error) {

      return onHandleData({ code: StatusCodes.INTERNAL_SERVER_ERROR, msg: "Failed to delete asset: " + error });

    }
  }

  /**
   * Retrieves user-related information.
   * @returns {Promise<Object>} Combined user information.
   */
  async userInfo() {
    try {
      const url1 = `/api/v1/storage/get_storage_size`;
      const data1 = await this.Http.getData(url1);

      const url2 = `/api/v1/storage/get_vip_info`;
      const data2 = await this.Http.getData(url2);

      const url3 = `/api/v1/storage/get_asset_count`;
      const data3 = await this.Http.getData(url3);

      const combinedData = {
        ...data1.data,
        ...data2.data,
        ...data3.data,
      };

      const data = {
        code: 0,
        data: combinedData,
      };

      log("TitanSDK:userInfo:", data);
      return data;
    } catch (error) {
      return onHandleData({ code: StatusCodes.INTERNAL_SERVER_ERROR, msg: "Failed to retrieve user information: " + error });
    }
  }
  async onShare(
    options = {
      id: null,
      expireAt: null,
      shortPass: "",
      hasDay: false,
      hasDomain: true
    }
  ) {
    try {
      const shareLoader = new ShareLoader(this.Http); // 实例化 ShareLoader
      return shareLoader.onShare(options); // 调用 ShareLoader 中的 onShare 方法
    } catch (error) {
      return onHandleData({ code: StatusCodes.INTERNAL_SERVER_ERROR, msg: "" + error });
    }
  }

  /**
   * 获取文件上传地址组
   * @returns {Promise<Object>} 文件上传地址组
   */
  async getUploadAddresses() {
    try {
      const response = await this.Http.getData(
        "/api/v1/storage/get_upload_info?t=" + new Date().getTime()
      );
      if (response.code !== 0) {
        return onHandleData({ code: response.code, msg: "Failed to get upload addresses: " + response });
      }
      return response.data.List;
    } catch (error) {
      return onHandleData({ code: StatusCodes.INTERNAL_SERVER_ERROR, msg: "Failed to get upload addresses: " + error });
    }
  }
  /**
  /**
 * 上传文件并监听进度
 * @param {string} uploadUrl - 文件上传地址
 * @param {string} token - 上传凭证
 * @param {File} file - 要上传的文件
 * @param {Function} onProgress - 进度回调函数，接受已上传字节数和总字节数作为参数
 * @returns {Promise<Object>} 上传结果
 */

  /**
   * 创建
   * @param {Object} assetData - 资产数据
   * @returns {Promise<Object>} 创建资产的结果
   */
  async createAsset(assetData) {
    try {
      const response = await this.Http.postData(
        "/api/v1/storage/create_asset",
        assetData
      );
      if (response.code !== 0) {
        return onHandleData({ code: response.code, msg: "Failed to create asset " });
      }
      return response;
    } catch (error) {
      return onHandleData({ code: StatusCodes.INTERNAL_SERVER_ERROR, msg: "Failed to create asset: " + error })
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
      retryCount: 2,
    },
    onProgress,
    onStreamStatus
  ) {
    this.uploadLoader = new UploadLoader(this.Http);
    return await this.uploadLoader.onFileUpload(
      file,
      assetData,
      onProgress,
      onStreamStatus
    );
  }
  ///下载
  async onFileDown(
    options = {
      areaId: [],
      assetCid: "",
      assetType: "",
      userId: "",
      hasTempFile: false,
      tempFileName: ""
    }, onProgress) {

    const { assetCid, assetType, userId, areaId, hasTempFile, tempFileName } = options;

    const validateAssetCid = Validator.validateAssetCid(assetCid);
    if (validateAssetCid) return validateAssetCid;
    let url = `/api/v1/storage/share_asset?asset_cid=` + assetCid;
    if (userId) {
      url = "/api/v1/storage/open_asset?user_id=" + userId + "&asset_cid=" + assetCid
      if (areaId && areaId.length > 0) {
        const areaIdParams = areaId.map(id => `area_id=${encodeURIComponent(id)}`).join("&");
        url += `&${areaIdParams}`;
      }
    }
    if (hasTempFile) {
      url = "/api/v1/storage/temp_file/download/" + assetCid
    }

    const res = await this.Http.getData(url);

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
      const filesize = res.data.size;
      const traceId = res.data.trace_id;

      // 实例化 Downloader
      const downloader = new Downloader(this.Http);
      if (assetType == "folder") {
        var downresult = await downloader.downloadFromMultipleUrls(
          urls,
          traceId,
          assetCid,
          fileName,
          filesize,
          onProgress
        )

        log("downresult", downresult);

        return downresult;
      } else if (assetType == "file") {
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
        )
        log("downresult.file", downresult);
        return downresult;
      } else {
        return onHandleData({ code: StatusCodes.Dowload_Type_ERROR, msg: "Failed to downresult: " })
      }
    } else {
      return res;
    }
  }

}

export default CommService;
