import { log, onHandleError } from "./errorHandler";
import StatusCodes from "./codes";
import { Validator } from "./validators";
class ShareLoader {
  constructor(http) {
    this.Http = http; // 接收 Http 实例
  }

  async onShare(
    options = {
      assetDetail: {},
      expireAt: null,
      shortPass: "",
    }
  ) {
    try {
      if (
        typeof options.assetDetail !== "object" ||
        options.assetDetail === null
      ) {
        return onHandleError(StatusCodes.ASSEST_OBJ_ERROR);
      }

      const { UserID, Cid, AssetType, ShareStatus, area_ids } =
        options.assetDetail;
      if (!UserID || !Cid || !AssetType) {
        return onHandleError(StatusCodes.MISSING_FIELDS_ERROR);
      }

      if (options.shortPass) {
        const shortPassRegex = /^[a-zA-Z0-9]{6}$/;
        if (!shortPassRegex.test(options.shortPass)) {
          return onHandleError(StatusCodes.INVALID_PASSWORD, "");
        }
      }

      if (ShareStatus == 0) {
        // 创建分享
        const [data] = await this.createShareLink({
          UserID,
          Cid,
          AssetType,
          area_ids,
          expireAt: options.expireAt,
          shortPass: options.shortPass,
        });
        return data;
      } else if (ShareStatus == 1) {
        // 更新分享
        const res = await this.updateShareLink({
          UserID,
          Cid,
          expireAt: options.expireAt,
        });
        return res;
      } else {
        return onHandleError(StatusCodes.SHARE_ERROE, "");
      }
    } catch (error) {
      return onHandleError(StatusCodes.INTERNAL_SERVER_ERROR, error.message);
    }
  }

  async createShareLink({
    UserID,
    Cid,
    AssetType,
    area_ids,
    expireAt,
    shortPass,
  }) {
    const uniqueAreaIds = [...new Set(area_ids || [])]
      .filter((item) => item !== "Singapore")
      .join(",");

    let urlp =
      window.location.origin +
      "/distributionstatus?cid=" +
      Cid +
      "&AssetType=" +
      AssetType +
      "&address=" +
      UserID +
      "&area_id=" +
      uniqueAreaIds;

    let url =
      `/api/v1/storage/create_link?username=` +
      UserID +
      "&cid=" +
      Cid +
      "&url=" +
      urlp +
      "&expire_time=" +
      (expireAt ?? 4102415999);

    if (shortPass) {
      url += `&short_pass=${shortPass}`;
    }

    let url2 =
      `/api/v1/storage/share_status_set?user_id=` + UserID + "&cid=" + Cid;

    if (area_ids && area_ids.length > 0) {
      const areaIdParams = area_ids
        .map((id) => `area_id=${encodeURIComponent(id)}`)
        .join("&");
      url += `&${areaIdParams}`;
      url2 += `&${areaIdParams}`;
    }

    return Promise.all([this.Http.getData(url), this.Http.getData(url2)]);
  }

  async updateShareLink({ UserID, Cid, expireAt }) {
    let url =
      `/api/v1/storage/share_link_info?username=` + UserID + "&cid=" + Cid;
    const res = await this.Http.getData(url);
    const linkId = res?.data?.link?.id;
    if (!linkId) {
      throw new Error("Link ID not found in the response.");
    }
    const shortPass = res?.data?.link?.short_pass;
    const body = {
      id: linkId,
      expire_at: expireAt ?? 4102415999,
      short_pass: shortPass,
    };
    return this.Http.postData("/api/v1/storage/share_link_update", body);
  }
}

export default ShareLoader;
