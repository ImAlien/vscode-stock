import { workspace, TreeItem } from 'vscode';
import { sinaApi, fillString, StockInfo } from './utils';

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

  async getFavorites(sortMode: number): Promise<Array<Stock>> {
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
}

export interface StockConfig{
  [key: string]:Array<any>;
}

export class Stock extends TreeItem {
  info: StockInfo;
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

