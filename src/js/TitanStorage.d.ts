// TitanStorage.d.ts
declare module "TitanStorage" {

    export default class TitanStorage {
        constructor();

        static initialize(options: {token: string;url: string; debug?: boolean; }): any;
        static getInstance(): TitanStorage;

        updateToken(newToken: string): Promise<any>;

        listRegions(): Promise<any>;

        createFolder(options: { name: string; parent: number }): Promise<any>;

        listDirectoryContents(options: { page: number; parent: number; pageSize: number }): Promise<any>;

        renameFolder(options: { groupId: number; name: string }): Promise<any>;

        renameAsset(options: { assetId: number; name: string }): Promise<any>;

        deleteFolder(options: { groupId: number }): Promise<any>;

        deleteAsset(options: { assetId: number; areaId: number[] }): Promise<any>;

        getUserProfile(): Promise<any>;

        getltemDetails(options: { cId: number; groupId: number }): Promise<any>;

        createSharedLink(options: { assetDetail: object; expireAt?: Date; shortPass?: string }): Promise<any>;

        uploadAsset(file: File, assetData: object, onProgress: Function, onStreamStatus: Function): Promise<any>;

        downloadAsset(assetCid: string, assetType: string, onProgress: Function): Promise<any>;
    }
}