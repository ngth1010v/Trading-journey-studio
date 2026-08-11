import LinkData, { initLinkData, destroyLinkData } from "./link/LinkData";

export default class SyncData {
  public link = new LinkData();

  public init(): void {
    initLinkData();
    this.link.init();
  }

  public destroy(): void {
    this.link.destroy();
    destroyLinkData();
  }
}