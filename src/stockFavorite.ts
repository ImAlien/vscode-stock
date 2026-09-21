import {window, EventEmitter, Event, TreeDataProvider, TreeItem, QuickPickItem } from 'vscode';
import { StockResource, Stock } from './stockResource';
import { sinaApi, searchStock, StockInfo } from './utils';

// 搜索结果候选项, 额外携带行情接口可用的 code
interface StockPickItem extends QuickPickItem {
  code: string;
}

export class StockProvider implements TreeDataProvider<Stock>{

  public _onDidChangeTreeData: EventEmitter<Stock | undefined> = new EventEmitter<Stock | undefined>();
  readonly onDidChangeTreeData: Event<Stock | undefined> = this._onDidChangeTreeData.event;
  private resource: StockResource;
  private order: number;


  constructor(resource: StockResource) {
    this.resource = resource;
    this.order = 0;
  }

  getTreeItem(element: Stock): TreeItem {
    const {lowWarn, now, highWarn, code} = element.info;
    // Low Price Warn
    if(!isNaN(+lowWarn) && +lowWarn >= +now){
      window.showWarningMessage(`${code} now price: ${now}`);
      this.resource.setWarnConfig(code, NaN, 0);
    }
    // High Price Warn
    if(!isNaN(+highWarn) && +highWarn <= +now){
      window.showWarningMessage(`${code} now price: ${now}`);
      this.resource.setWarnConfig(code, NaN, 1);
    }
    
    return element;
  }

  getChildren(): Promise<Array<Stock>> {
     return this.resource.getFavorites(this.order);
  }

  changeOrder(): void {
    if(this.order === 1){
      this.order = -1;
    }else{
      this.order = this.order + 1;
    }
    this._onDidChangeTreeData.fire();
  }

  async addFavorite(){
    const quickPick = window.createQuickPick<StockPickItem>();
    quickPick.title = '搜索并添加股票';
    quickPick.placeholder = '输入 名称/拼音/代码 搜索 (如: 茅台 / maotai / gzmt / 600519), 回车添加, Esc 完成';
    quickPick.matchOnDescription = true;
    let addedCount = 0;
    let timer: any;
    let seq = 0; // 请求序号, 丢弃过期的异步结果, 避免快速输入时结果错位

    quickPick.onDidChangeValue(value => {
      if (timer) { clearTimeout(timer); }
      const keyword = value.trim();
      if (!keyword) {
        quickPick.items = [];
        quickPick.busy = false;
        return;
      }
      quickPick.busy = true;
      const current = ++seq;
      // 简单防抖, 减少输入过程中的请求次数
      timer = setTimeout(async () => {
        const list = await searchStock(keyword);
        if (current !== seq) { return; } // 已有更新的输入, 丢弃本次结果
        quickPick.items = list.map(s => ({
          label: s.name,
          description: `${s.market}  ${s.code}`,
          code: s.code,
        }));
        quickPick.busy = false;
      }, 300);
    });

    quickPick.onDidAccept(async () => {
      const pick = quickPick.selectedItems[0];
      if (!pick) { return; }
      quickPick.busy = true;
      let result;
      try {
        result = await sinaApi({ [pick.code]: ['-', '-'] });
      } catch (e) {
        window.showErrorMessage(`添加失败: ${e instanceof Error ? e.message : e}`);
        quickPick.busy = false;
        return;
      }
      const insertStockObj: { [key: string]: any[] } = {};
      result.forEach(stockInfo => {
        if (stockInfo) {
          insertStockObj[`${stockInfo.info.code}`] = ['-', '-'];
        }
      });
      if (Object.keys(insertStockObj).length === 0) {
        window.showWarningMessage(`未获取到行情: ${pick.label} (${pick.code})`);
        quickPick.busy = false;
        return;
      }
      this.resource.updateConfig(insertStockObj);
      this._onDidChangeTreeData.fire();
      addedCount++;
      quickPick.title = `搜索并添加股票 (已添加 ${addedCount} 支)`;
      window.setStatusBarMessage(`已添加: ${pick.label} (${pick.code})`, 2000);
      // 保持面板常驻, 清空输入便于继续搜索添加下一支
      quickPick.value = '';
      quickPick.items = [];
      quickPick.busy = false;
    });

    quickPick.onDidHide(() => quickPick.dispose());
    quickPick.show();
  }

  async setHighWarn(stock: {info: StockInfo}){
    const { info } = stock;
      const res = await window.showInputBox({
        value: isNaN(+info.highWarn) ? info.now : info.highWarn,
        valueSelection: [0, -1],
        prompt: '设置高报警价:',
        placeHolder: '设置高报警价',
        validateInput: (text: string) => {
          return isNaN(+text) || +text <= +info.now ? `高报警价必须大于现价: ${info.now}` : null;
        },
      });
      if (res !== undefined) {
        this.resource.setWarnConfig(info.code, +res, 1);
      }
  }

  async setLowWarn(stock: {info: StockInfo}){
    {
      const { info } = stock;
      const res = await window.showInputBox({
        value: isNaN(+info.lowWarn) ? info.now : info.lowWarn,
        valueSelection: [0, -1],
        prompt: '设置低报警价:',
        placeHolder: '设置低报警价',
        validateInput: (text: string) => {
          return isNaN(+text) || +text >= +info.now ? `低报警价必须小于现价: ${info.now}` : null;
        },
      });
      if (res !== undefined) {
        this.resource.setWarnConfig(info.code, +res, 0);
      }
    }
  }
  remove(stock: {info: StockInfo}){
    const { info } = stock;
    this.resource.removeConfig(info.code);
    this._onDidChangeTreeData.fire();
  }

  async move(stock: {info: StockInfo}, action: 'top' | 'bottom' | 'up' | 'down'){
    this.order = 0; // 重置为自然顺序, 否则按涨跌幅排序时看不到手动调整效果
    await this.resource.moveConfig(stock.info.code, action); // 先等写入完成, 再刷新, 避免读到旧顺序
    this._onDidChangeTreeData.fire();
  }
}