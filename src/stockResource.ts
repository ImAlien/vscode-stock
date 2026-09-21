import { workspace, TreeItem, TreeItemCollapsibleState } from 'vscode';
import { sinaApi, fillString, StockInfo } from './utils';

export type CategoryKind = 'all' | 'market' | 'custom';

/** 根据代码前缀判断所属市场分类 */
export function marketOf(code: string): 'A股' | '港股' | '美股' | '' {
  if (/^(sh|sz)/.test(code)) { return 'A股'; }
  if (/^hk/.test(code)) { return '港股'; }
  if (/^gb_/.test(code)) { return '美股'; }
  return '';
}

export class StockResource {
  constructor() {
  }

  updateConfig(stocks: object) {
    const config = workspace.getConfiguration();
    const favoriteConfig = Object.assign({}, config.get('super-stock.favorite', {}), stocks);
    config.update('super-stock.favorite', favoriteConfig, true);
  }
  
  /**
   * set warnPrice
   * @param code Symbol Code
   * @param warnPrice Warn Price
   * @param flag  Warn Type that 1 is High Warn, others is low Warn
   */
  setWarnConfig(code: string, warnPrice: number, flag: Number) {
    const config = workspace.getConfiguration();
    const favoriteConfig:StockConfig = Object.assign({}, config.get('super-stock.favorite', {}));
    const updateConfig = {[code]: flag === 1 ? [favoriteConfig[code][0], warnPrice.toFixed(2)] : [warnPrice.toFixed(2), favoriteConfig[code][1]]};
    config.update('super-stock.favorite', Object.assign({}, favoriteConfig, updateConfig), true);
  }

  removeConfig(stockCode: string){
    const config = workspace.getConfiguration();
    const favoriteConfig:StockConfig = Object.assign({}, config.get('super-stock.favorite', {}));
    delete favoriteConfig[`${stockCode}`];
    config.update('super-stock.favorite', favoriteConfig, true);
    // 清理该股在自定义分类与顺序中的引用
    const categories = Object.assign({}, config.get('super-stock.categories', {})) as {[k: string]: string[]};
    Object.keys(categories).forEach(name => {
      categories[name] = (categories[name] || []).filter(c => c !== stockCode);
    });
    config.update('super-stock.categories', categories, true);
    const order = (config.get('super-stock.order', []) as string[]).filter(c => c !== stockCode);
    config.update('super-stock.order', order, true);
  }

  /**
   * 调整自选股票在列表中的顺序
   * 顺序单独存在 super-stock.order 数组中(顺序敏感), 避免 VS Code 将仅重排键的对象视为“未变化”而跳过写入
   * @param code 目标股票代码
   * @param action 'top' 置顶 | 'bottom' 置底 | 'up' 上移 | 'down' 下移
   */
  moveConfig(code: string, action: 'top' | 'bottom' | 'up' | 'down') {
    const config = workspace.getConfiguration();
    const favoriteConfig: StockConfig = Object.assign({}, config.get('super-stock.favorite', {}));
    const favKeys = Object.keys(favoriteConfig);
    // 以已有顺序为基础, 剔除已删除的股票, 并将未纳入顺序的自选股追加到末尾(保持其自然顺序)
    const order = (config.get('super-stock.order', []) as string[]).filter(c => favKeys.indexOf(c) !== -1);
    favKeys.forEach(k => { if (order.indexOf(k) === -1) { order.push(k); } });
    const idx = order.indexOf(code);
    if (idx === -1) { return Promise.resolve(); }
    order.splice(idx, 1);
    let newIdx = idx;
    switch (action) {
      case 'top': newIdx = 0; break;
      case 'bottom': newIdx = order.length; break;
      case 'up': newIdx = Math.max(0, idx - 1); break;
      case 'down': newIdx = Math.min(order.length, idx + 1); break;
    }
    order.splice(newIdx, 0, code);
    return config.update('super-stock.order', order, true);
  }

  async getAllStocks(sortMode: number): Promise<Array<Stock>> {
    const configuration = workspace.getConfiguration();
    const favorite = configuration.get('super-stock.favorite', {});
    const result = await sinaApi(favorite);
    if (sortMode !== 0) {
      return result.sort(({info:{changeRate:a=0 }}, {info:{changeRate: b=0}})=>{
        return (+a >= +b) ? sortMode * 1: sortMode * -1;
        });
    }
    // 自然顺序模式: 按用户自定义顺序排列, 未入 order 的代码保持自然顺序排在后面
    const customOrder = configuration.get('super-stock.order', []) as string[];
    if (customOrder.length) {
      result.sort((a, b) => {
        const ia = customOrder.indexOf(a.info.code);
        const ib = customOrder.indexOf(b.info.code);
        return (ia === -1 ? Number.MAX_SAFE_INTEGER : ia) - (ib === -1 ? Number.MAX_SAFE_INTEGER : ib);
      });
    }
    return result;
  }

  /** 构建分类节点列表(纯配置, 无需网络): 全部 + 非空市场分类 + 自定义分类 */
  buildCategories(): Category[] {
    const config = workspace.getConfiguration();
    const codes = Object.keys(config.get('super-stock.favorite', {}));
    const custom = config.get('super-stock.categories', {}) as {[k: string]: string[]};
    const cats: Category[] = [ new Category('全部', 'all', codes.length) ];
    (['A股', '港股', '美股'] as const).forEach(m => {
      const n = codes.filter(c => marketOf(c) === m).length;
      if (n > 0) { cats.push(new Category(m, 'market', n)); }
    });
    Object.keys(custom).forEach(name => {
      const n = codes.filter(c => (custom[name] || []).indexOf(c) !== -1).length;
      cats.push(new Category(name, 'custom', n));
    });
    return cats;
  }

  /** 按分类过滤股票, 为每个分类生成独立 id 的新 Stock 实例(避免多父节点 id 冲突) */
  filterByCategory(all: Stock[], category: Category): Stock[] {
    const custom = workspace.getConfiguration().get('super-stock.categories', {}) as {[k: string]: string[]};
    return all
      .filter(s => {
        const code = s.info.code;
        if (category.kind === 'all') { return true; }
        if (category.kind === 'market') { return marketOf(code) === category.name; }
        return (custom[category.name] || []).indexOf(code) !== -1;
      })
      .map(s => {
        const item = new Stock(s.info);
        item.id = `${category.name}::${s.info.code}`;      // 唯一 id
        item.contextValue = category.kind === 'custom' ? 'stockInCategory' : 'stock';
        item.categoryName = category.name;                 // 供“移出分类”使用
        item.isPrimary = category.kind === 'all';          // 仅“全部”触发报警弹窗, 避免重复
        return item;
      });
  }

  /** 获取所有自定义分类名称 */
  getCustomCategoryNames(): string[] {
    const custom = workspace.getConfiguration().get('super-stock.categories', {}) as {[k: string]: string[]};
    return Object.keys(custom);
  }

  /** 新建自定义分类(已存在则保留) */
  createCategory(name: string) {
    const config = workspace.getConfiguration();
    const categories = Object.assign({}, config.get('super-stock.categories', {})) as {[k: string]: string[]};
    if (!categories[name]) { categories[name] = []; }
    return config.update('super-stock.categories', categories, true);
  }

  /** 删除自定义分类(不影响自选股本身) */
  deleteCategory(name: string) {
    const config = workspace.getConfiguration();
    const categories = Object.assign({}, config.get('super-stock.categories', {})) as {[k: string]: string[]};
    delete categories[name];
    return config.update('super-stock.categories', categories, true);
  }

  /** 重命名自定义分类 */
  renameCategory(oldName: string, newName: string) {
    const config = workspace.getConfiguration();
    const categories = Object.assign({}, config.get('super-stock.categories', {})) as {[k: string]: string[]};
    if (!categories[oldName] || categories[newName]) { return Promise.resolve(); }
    categories[newName] = categories[oldName];
    delete categories[oldName];
    return config.update('super-stock.categories', categories, true);
  }

  /** 将若干股票加入分类(并集, 自动建分类) */
  addToCategory(name: string, codes: string[]) {
    const config = workspace.getConfiguration();
    const categories = Object.assign({}, config.get('super-stock.categories', {})) as {[k: string]: string[]};
    const set = (categories[name] || []).slice();
    codes.forEach(c => { if (set.indexOf(c) === -1) { set.push(c); } });
    categories[name] = set;
    return config.update('super-stock.categories', categories, true);
  }

  /** 将股票从分类中移出 */
  removeFromCategory(name: string, code: string) {
    const config = workspace.getConfiguration();
    const categories = Object.assign({}, config.get('super-stock.categories', {})) as {[k: string]: string[]};
    if (!categories[name]) { return Promise.resolve(); }
    categories[name] = categories[name].filter(c => c !== code);
    return config.update('super-stock.categories', categories, true);
  }
}

export interface StockConfig{
  [key: string]:Array<any>;
}

export class Stock extends TreeItem {
  info: StockInfo;
  categoryName?: string;  // 当前所属分类名(供“移出分类”使用)
  isPrimary?: boolean;    // 是否处于“全部”分类(仅此处触发报警弹窗, 避免重复)
  constructor(info: StockInfo) {
    super(`${fillString(info.name, 9)} ${fillString(info.now, 8, false)} ${fillString(info.changeAmount, 8, false)} ${fillString(info.changeRate + '%', 7, false)}`);
    this.info = info;
    // 稳定 id: 刷新时复用节点, 减少重建并保持选中态
    this.id = info.code;
    this.tooltip = `
 公司:       ${info.name}
 代码:       ${info.code}
 成交量:   ${info.volume}股${info.amount ?  `\n 成交额:   ${info.amount}`: ''}${info.highStop ? `\n 涨停:       ${info.highStop}`: ''}${info.lowStop ? `\n 跌停:       ${info.lowStop}`: ''}
 -------------------------
 现价:       ${info.now}
 涨跌幅:   ${info.changeRate}%
 涨跌额:   ${info.changeAmount}
 今开:       ${info.open}
 昨收:       ${info.lastClose}
 -------------------------
 最高:       ${info.high}   ${info.highRate}%
 最低:       ${info.low}   ${info.lowRate}%
 -------------------------
 低价警报:  ${!isNaN(+info.lowWarn)?info.lowWarn :'-'}
 高价警报:  ${!isNaN(+info.highWarn)?info.highWarn :'-'}
    `;
  }
}

export class Category extends TreeItem {
  constructor(public name: string, public kind: CategoryKind, count: number) {
    super(
      `${name} (${count})`,
      name === '全部' ? TreeItemCollapsibleState.Expanded : TreeItemCollapsibleState.Collapsed
    );
    this.id = `cat::${name}`;
    this.contextValue = kind === 'custom' ? 'categoryCustom'
                      : kind === 'market' ? 'categoryBuiltin' : 'categoryAll';
  }
}

