/** Keep end-of-list demand alive while a query is busy. Each list owns one gate. */
export class RemoteLibraryPaging {
  private height = 0;
  private contentHeight = 0;
  private offset = 0;
  private nearEnd = false;
  private requested = false;

  scroll(offset: number, height: number, contentHeight: number) {
    this.offset = offset;
    this.height = height;
    this.contentHeight = contentHeight;
    return this.measure();
  }

  layout(height: number) {
    this.height = height;
    return this.measure();
  }

  contentSize(height: number) {
    this.contentHeight = height;
    return this.measure();
  }

  private measure() {
    const previous = this.nearEnd;
    this.nearEnd = this.height > 0 && this.contentHeight > 0 &&
      this.contentHeight - this.offset - this.height <= this.height;
    return previous !== this.nearEnd;
  }

  endReached() { this.nearEnd = true; }
  request() { this.requested = true; }

  take(hasNext: boolean, fetching: boolean, failed: boolean) {
    if (!hasNext || fetching || (!this.requested && (!this.nearEnd || failed)))
      return false;
    this.requested = false;
    return true;
  }
}
