import { log, onHandleError } from "./errorHandler";
import StatusCodes from "./codes";
import { Validator } from "./validators";
class ShareLoader {
  constructor(http) {
    this.Http = http; // 接收 Http 实例
  }

  async onShare(options = { id: null, expireAt: null, shortPass: "", hasDay: false }) {
    try {
      // Validate options
      if (typeof options !== "object" || options === null) {
        return onHandleError(StatusCodes.ASSET_OBJ_ERROR, "Invalid options provided.");
      }

      const { id, expireAt, shortPass, hasDay } = options;

      // Validate id
      if (!id) {
        return onHandleError(StatusCodes.ID_KEY_EMPTY, "ID must not be null or empty.");
      }

      // Determine whether id is numeric (groupid) or CID
      const isNumeric = /^\d+$/.test(id);
      const queryParam = isNumeric ? `groupid=${id}` : `cid=${id}`;

      // Fetch asset group information
      const groupInfoResponse = await this.Http.getData(`/api/v1/storage/get_asset_group_info?${queryParam}`);
      //log(isNumeric ? 123 : 456, groupInfoResponse);

      // Handle invalid response
      if (!groupInfoResponse || groupInfoResponse.code !== 0 || !groupInfoResponse.data) {
        return onHandleError(StatusCodes.REQUEST_ERROR, "Failed to retrieve asset group information.");
      }

      // Extract necessary data based on the id type 
      let ShareStatus, UserID, Cid, AssetType, AreaIds;

      if (isNumeric) {
        const group = groupInfoResponse.data.data.Group;
        if (!group) {
          return onHandleError(StatusCodes.REQUEST_ERROR, "Group data is missing.");
        }
        ShareStatus = group.ShareStatus;
        UserID = group.UserID;
        Cid = group.ID;
        AssetType = "folder";
      } else {
        const assetOverview = groupInfoResponse.data.data.AssetOverview;
        if (!assetOverview || !assetOverview.UserAssetDetail || !assetOverview.AssetRecord) {
          return onHandleError(StatusCodes.REQUEST_ERROR, "AssetOverview data is incomplete.");
        }
        ShareStatus = assetOverview.UserAssetDetail.ShareStatus;
        UserID = assetOverview.UserAssetDetail.UserID;
        Cid = assetOverview.AssetRecord.CID;
        AssetType = assetOverview.UserAssetDetail.AssetType;
        AreaIds = assetOverview.UserAssetDetail.area_ids;
      }
      // Handle sharing based on ShareStatus
      if (ShareStatus === 0) {
        // If not shared, create a new share link
        const createShareLinkOptions = {
          isNumeric,
          UserID,
          Cid,
          AssetType: AssetType,
          expireAt: expireAt,
          shortPass: shortPass,
          area_ids: AreaIds,
          hasDay: hasDay
        };

        const data = await this.onCreateShareLink(createShareLinkOptions);
        return data;
      } else {
        // If already shared, update the existing share link
        const updateShareLinkResponse = await this.onUpdateShareLink(UserID, Cid, expireAt, shortPass, hasDay);
        return updateShareLinkResponse;
      }
    } catch (error) {
      // Handle unexpected errors
      return onHandleError(StatusCodes.INTERNAL_SERVER_ERROR, error.message);
    }
  }



  async onCreateShareLink({
    isNumeric,
    UserID,
    Cid,
    AssetType,
    expireAt,
    shortPass,
    area_ids,
    hasDay
  }) {
    try {
      const baseURL = "https://storage.titannet.io";
      const path = isNumeric ? "/groupPreview" : "/distributionstatus";

      // 构建预览 URL
      let previewURL = `${baseURL}${path}?cid=${Cid}&AssetType=${AssetType}&address=${UserID}`;

      if (!isNumeric && area_ids && area_ids.length > 0) {
        const areaIdParams = area_ids.map(id => `area_id=${encodeURIComponent(id)}`).join("&");
        previewURL += `&${areaIdParams}`;
      }

      // 验证并处理 expireAt 参数，默认值为 4101509461 (秒)
      let currentExpireAt = Math.floor(new Date(4101509461000).getTime() / 1000);
      if (expireAt) {
        const expireAtValidationError = Validator.validateExpireAt(expireAt);
        if (expireAtValidationError) {
          return expireAtValidationError; // 返回验证错误
        }
        if (hasDay) {
          currentExpireAt = this.getFutureTimestamp(expireAt); // 确保 expireAt 是时间戳
        } else {
          currentExpireAt = expireAt;
        }
      }

      // 构建创建分享链接的URL
      let createLinkURL = `/api/v1/storage/create_link?username=${UserID}&cid=${Cid}&url=${encodeURIComponent(previewURL)}&expire_time=${currentExpireAt}`;

      // 验证并处理 shortPass 参数
      if (shortPass) {
        const shortPassValidationError = Validator.validateShortPass(shortPass);
        if (shortPassValidationError) {
          return shortPassValidationError; // 返回验证错误
        }
        createLinkURL += `&short_pass=${shortPass}`;
      }

      // 添加 area_id 参数（仅适用于文件/文件夹）
      if (!isNumeric && area_ids && area_ids.length > 0) {
        const areaIdParams = area_ids.map(id => `area_id=${encodeURIComponent(id)}`).join("&");
        createLinkURL += `&${areaIdParams}`;
      }

      // 发送创建分享链接请求
      const createLinkResponse = await this.Http.getData(createLinkURL);

      if (createLinkResponse.code === 0) {
        // 构建并发送分享状态设置的请求
        let shareStatusURL = `/api/v1/storage/share_status_set?user_id=${UserID}&cid=${Cid}`;
        if (!isNumeric && area_ids && area_ids.length > 0) {
          const areaIdParams = area_ids.map(id => `area_id=${encodeURIComponent(id)}`).join("&");
          shareStatusURL += `&${areaIdParams}`;
        }

        await this.Http.getData(shareStatusURL);

        // 更新 URL 并返回结果
        createLinkResponse.data.url = `${baseURL}${encodeURI(createLinkResponse.data.url)}`;
        return createLinkResponse;
      } else {
        // 返回错误信息
        return createLinkResponse;
      }
    } catch (error) {
      // 捕获并处理请求错误
      return onHandleError(StatusCodes.REQUEST_ERROR, error.message);
    }
  }



  getFutureTimestamp(days) {
    const currentDate = new Date(); // 获取当前日期和时间
    const futureDate = new Date(currentDate.getTime() + days * 24 * 60 * 60 * 1000); // 计算N天后的时间
    return Math.floor(futureDate.getTime() / 1000); // 返回时间戳（秒）
  }

  async onUpdateShareLink(UserID, ID, expireAt, shortPass, hasDay) {

    const shareLinkResponse = await this.Http.getData(`/api/v1/storage/share_link_info?username=${UserID}&cid=${ID}`);
    const { id, short_pass: originalShortPass, expire_at: originalExpireAt, short_link } = shareLinkResponse.data.link;

    let currentShortPass = originalShortPass;
    let currentExpireAt = new Date(originalExpireAt).getTime() / 1000;

    // 验证 shortPass
    if (shortPass) {
      const shortPassValidator = Validator.validateShortPass(shortPass);
      if (shortPassValidator) {
        return shortPassValidator;
      }
      currentShortPass = shortPass;
    }

    // 验证 expireAt
    if (expireAt) {
      const expireAtValidator = Validator.validateExpireAt(expireAt);
      if (expireAtValidator) {
        return expireAtValidator;
      }

      if (hasDay) {
        currentExpireAt = this.getFutureTimestamp(expireAt); // 确保 expireAt 是时间戳
      } else {
        currentExpireAt = expireAt;
      }
    }
    const body = {
      id,
      expire_at: currentExpireAt, // 如果未传入 expireAt, 则使用原值
      short_pass: currentShortPass, // 如果未传入 shortPass, 则使用原值
    };
    var res = await this.Http.postData("/api/v1/storage/share_link_update", body);
    if (res.code == 0) {
      res.data.url = "https://storage.titannet.io" + encodeURI(short_link);
    }
    return res

  }
}

export default ShareLoader;
