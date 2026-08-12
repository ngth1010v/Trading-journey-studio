import LinkData from "./link/LinkData";

export default class SyncData {
  public link = new LinkData();

  public init(): void {
    this.link.init();
  }

  public destroy(): void {
    this.link.destroy();
  }
}