import {window, EventEmitter, Event, TreeDataProvider, TreeItem, QuickPickItem } from 'vscode';
import { StockResource, Stock, Category } from './stockResource';
import { sinaApi, searchStock, StockInfo } from './utils';

// 搜索结果候选项, 额外携带行情接口可用的 code
interface StockPickItem extends QuickPickItem {
  code: string;
}

type StockTreeNode = Stock | Category;

export class StockProvider implements TreeDataProvider<StockTreeNode>{

  public _onDidChangeTreeData: EventEmitter<StockTreeNode | undefined> = new EventEmitter<StockTreeNode | undefined>();
  readonly onDidChangeTreeData: Event<StockTreeNode | undefined> = this._onDidChangeTreeData.event;
  private resource: StockResource;
  private order: number;
  private stocksPromise?: Promise<Stock[]>; // 每次刷新拓一次, 供各分类复用


  constructor(resource: StockResource) {
    this.resource = resource;
    this.order = 0;
  }

  getTreeItem(element: StockTreeNode): TreeItem {
    if (element instanceof Stock) {
      // 仅“全部”分类的节点触发报警检查, 避免多分类下重复弹窗
      if (element.isPrimary) {
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
      }
    }
    return element;
  }

  getChildren(element?: StockTreeNode): Promise<Array<StockTreeNode>> {
    if (!element) {
      this.stocksPromise = this.resource.getAllStocks(this.order); // 根节点: 拓一次全部行情
      return Promise.resolve(this.resource.buildCategories());
    }
    if (element instanceof Category) {
      const promise = this.stocksPromise || (this.stocksPromise = this.resource.getAllStocks(this.order));
      return promise.then(all => this.resource.filterByCategory(all, element));
    }
    return Promise.resolve([]);
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

  async createCategory(){
    const name = await window.showInputBox({
      prompt: '新建分类, 输入分类名称',
      placeHolder: '如: 科技股 / 长期持有',
      validateInput: (text: string) => {
        const v = text.trim();
        if (!v) { return '分类名称不能为空'; }
        if (['全部', 'A股', '港股', '美股'].indexOf(v) !== -1) { return '不能使用内置分类名称'; }
        return null;
      },
    });
    if (name !== undefined && name.trim()) {
      await this.resource.createCategory(name.trim());
      this._onDidChangeTreeData.fire();
    }
  }

  async deleteCategory(category: Category){
    if (!category || category.kind !== 'custom') { return; }
    await this.resource.deleteCategory(category.name);
    this._onDidChangeTreeData.fire();
  }

  async renameCategory(category: Category){
    if (!category || category.kind !== 'custom') { return; }
    const newName = await window.showInputBox({
      value: category.name,
      prompt: '重命名分类',
      validateInput: (text: string) => {
        const v = text.trim();
        if (!v) { return '分类名称不能为空'; }
        if (['全部', 'A股', '港股', '美股'].indexOf(v) !== -1) { return '不能使用内置分类名称'; }
        return null;
      },
    });
    if (newName !== undefined && newName.trim() && newName.trim() !== category.name) {
      await this.resource.renameCategory(category.name, newName.trim());
      this._onDidChangeTreeData.fire();
    }
  }

  async addToCategory(stock: Stock){
    const custom = this.resource.getCustomCategoryNames();
    const NEW_LABEL = '＋ 新建分类';
    const picked = await window.showQuickPick([NEW_LABEL, ...custom], {
      placeHolder: `将 ${stock.info.name} 加入分类`,
      canPickMany: true,
    });
    if (!picked || picked.length === 0) { return; }
    const targets = picked.filter(p => p !== NEW_LABEL);
    if (picked.indexOf(NEW_LABEL) !== -1) {
      const name = await window.showInputBox({
        prompt: '新建分类, 输入分类名称',
        validateInput: (text: string) => {
          const v = text.trim();
          if (!v) { return '分类名称不能为空'; }
          if (['全部', 'A股', '港股', '美股'].indexOf(v) !== -1) { return '不能使用内置分类名称'; }
          return null;
        },
      });
      if (name !== undefined && name.trim()) { targets.push(name.trim()); }
    }
    if (targets.length === 0) { return; }
    for (const name of targets) {
      await this.resource.addToCategory(name, [stock.info.code]);
    }
    this._onDidChangeTreeData.fire();
  }

  async removeFromCategory(stock: Stock){
    if (!stock.categoryName) { return; }
    await this.resource.removeFromCategory(stock.categoryName, stock.info.code);
    this._onDidChangeTreeData.fire();
  }
}