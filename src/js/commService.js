import { Http } from "./http";
import { log, onHandleError } from "./errorHandler";
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
      log("API token updated successfully.");
    } else {
      log("Invalid API token.");
      return onHandleError(
        StatusCodes.BAD_REQUEST,
        "Invalid API token provided."
      );
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
      return onHandleError(
        StatusCodes.INTERNAL_SERVER_ERROR,
        "Failed to get area ID: " + error.message
      );
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
      return onHandleError(
        StatusCodes.INTERNAL_SERVER_ERROR,
        "Failed to create group: " + error.message
      );
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
      return onHandleError(
        StatusCodes.INTERNAL_SERVER_ERROR,
        "Failed to get asset group list: " + error.message
      );
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
      return onHandleError(
        StatusCodes.INTERNAL_SERVER_ERROR,
        "Failed to rename group: " + error.message
      );
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
      return onHandleError(
        StatusCodes.INTERNAL_SERVER_ERROR,
        "Failed to rename asset: " + error.message
      );
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
      return onHandleError(
        StatusCodes.INTERNAL_SERVER_ERROR,
        "Failed to delete group: " + error.message
      );
    }
  }

  async getAssetGroupInfo(options = { cId: -1, groupId: -1 }) {
    try {


      if (options.cId === -1 && options.groupId === -1) {
        return onHandleError(StatusCodes.ID_KEY_EMPTY, "At least one ID (cId or groupId) is required.");
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
      return onHandleError(
        StatusCodes.INTERNAL_SERVER_ERROR,
        "Failed to getAssetGroupInfo : " + error.message
      );
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
        return onHandleError(StatusCodes.ID_KEY_EMPTY, "Asset ID is required.");
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
      return onHandleError(
        StatusCodes.INTERNAL_SERVER_ERROR,
        "Failed to delete asset: " + error.message
      );
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
      return onHandleError(
        StatusCodes.INTERNAL_SERVER_ERROR,
        "Failed to retrieve user information: " + error.message
      );
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
      return onHandleError(StatusCodes.INTERNAL_SERVER_ERROR, error.message);
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
        return onHandleError(
          response.code,
          "Failed to get upload addresses: " + response
        );
      }
      return response.data.List;
    } catch (error) {
      return onHandleError(
        StatusCodes.INTERNAL_SERVER_ERROR,
        "Failed to get upload addresses: " + error.message
      );
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
        return onHandleError(response.code, "Failed to create asset.");
      }
      return response;
    } catch (error) {
      return onHandleError(
        StatusCodes.INTERNAL_SERVER_ERROR,
        "Failed to create asset: " + error.message
      );
    }
  }

  /**
   * 处理文件上传逻辑
   * @param {File} file - 要上传的文
   * @param {Object} assetData  必填: { extraId:"" 外部ID(集成通知使用，非必填):  areaId: []：区域标识(未空时：系统根据规则自动分发文件至全球区域。下载文件时，系统根据用户IP计算区域，并分配离用户最近的节点进行下载，不为空时：上传待指定的区域，可通过onAreaId获取list数组：如"area_id": [
        "SouthKorea",
        "Japan"
    ],), 
    groupId: 0：节点ID：默认为根节点，如果需要上传到根节点需要获取Group下的ID，如Group.ID };
    assetType: 文件类型：默认0 ：文件，1:文件夹
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
    }, onProgress) {

    const { assetCid, assetType, userId } = options;

    const validateAssetCid = Validator.validateAssetCid(assetCid);
    if (validateAssetCid) return validateAssetCid;
    let url = `/api/v1/storage/share_asset?asset_cid=` + assetCid;
    if (userId) {
      url = "/api/v1/storage/open_asset?user_id=" + uid + "&asset_cid=" + assetCid

      if (areaId && areaId.length > 0) {
        const areaIdParams = area_ids.map(id => `area_id=${encodeURIComponent(id)}`).join("&");
        url += `&${areaIdParams}`;
      }

    }
    const res = await this.Http.getData(url);

    if (res.code === 0) {
      const urls = res.data.url;

      function getFileNameFromUrl(url) {
        const urlObj = new URL(url);
        const params = new URLSearchParams(urlObj.search);
        return params.get("filename"); // 获取 'filename' 参数的值
      }
      const fileName = getFileNameFromUrl(urls[0]);
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
        return onHandleError(StatusCodes.Dowload_Type_ERROR, "");
      }
    } else {
      return res;
    }
  }

}

export default CommService;
