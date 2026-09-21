import { ExtensionContext, commands, window, workspace } from 'vscode';

import { StockProvider } from './stockFavorite';
import { StockResource } from './stockResource';

export function activate(context: ExtensionContext) {

  let interval = workspace.getConfiguration().get('super-stock.interval', 2);
  if (interval < 2) { interval = 2; }

  const stockResource = new StockResource();
  const nodeFavoriteStockProvider = new StockProvider(stockResource);

  // 自动刷新定时器, 暂停后可让 tooltip 常驻(TreeView 无 hover 事件, 只能手动暂停)
  let timer: any;
  const startRefresh = () => {
    if (timer === undefined) {
      timer = setInterval(() => {
        nodeFavoriteStockProvider._onDidChangeTreeData.fire();
      }, interval * 1000);
    }
  };
  const stopRefresh = () => {
    if (timer !== undefined) {
      clearInterval(timer);
      timer = undefined;
    }
  };
  const setPaused = (paused: boolean) => {
    commands.executeCommand('setContext', 'super-stock.paused', paused);
  };

  startRefresh();
  setPaused(false);

  window.registerTreeDataProvider('super-stock-favorite', nodeFavoriteStockProvider);

  context.subscriptions.push(
    { dispose: stopRefresh },
    commands.registerCommand('super-stock-favorite.pause', ()=>{
      stopRefresh();
      setPaused(true);
      window.setStatusBarMessage('股票行情: 已暂停自动刷新, 悬浮可查看详情', 3000);
    }),
    commands.registerCommand('super-stock-favorite.resume', ()=>{
      startRefresh();
      setPaused(false);
      nodeFavoriteStockProvider._onDidChangeTreeData.fire();
      window.setStatusBarMessage('股票行情: 已恢复自动刷新', 2000);
    }),
    commands.registerCommand('super-stock-favorite.order', ()=>{nodeFavoriteStockProvider.changeOrder();}),
    commands.registerCommand('super-stock-favorite.add', ()=>{nodeFavoriteStockProvider.addFavorite(); } ),
    commands.registerCommand('super-stock-favorite.item.setHighWarn', (stock)=>{nodeFavoriteStockProvider.setHighWarn(stock);}),
    commands.registerCommand('super-stock-favorite.item.setLowWarn', (stock)=>{nodeFavoriteStockProvider.setLowWarn(stock);}),
    commands.registerCommand('super-stock-favorite.item.remove', (stock)=>{nodeFavoriteStockProvider.remove(stock);}),
    commands.registerCommand('super-stock-favorite.item.moveTop', (stock)=>{nodeFavoriteStockProvider.move(stock, 'top');}),
    commands.registerCommand('super-stock-favorite.item.moveUp', (stock)=>{nodeFavoriteStockProvider.move(stock, 'up');}),
    commands.registerCommand('super-stock-favorite.item.moveDown', (stock)=>{nodeFavoriteStockProvider.move(stock, 'down');}),
    commands.registerCommand('super-stock-favorite.item.moveBottom', (stock)=>{nodeFavoriteStockProvider.move(stock, 'bottom');}),
    commands.registerCommand('super-stock-favorite.createCategory', ()=>{nodeFavoriteStockProvider.createCategory();}),
    commands.registerCommand('super-stock-favorite.category.delete', (category)=>{nodeFavoriteStockProvider.deleteCategory(category);}),
    commands.registerCommand('super-stock-favorite.category.rename', (category)=>{nodeFavoriteStockProvider.renameCategory(category);}),
    commands.registerCommand('super-stock-favorite.item.addToCategory', (stock)=>{nodeFavoriteStockProvider.addToCategory(stock);}),
    commands.registerCommand('super-stock-favorite.item.removeFromCategory', (stock)=>{nodeFavoriteStockProvider.removeFromCategory(stock);}),
  ); // subscriptions
}

export function deactivate() {}