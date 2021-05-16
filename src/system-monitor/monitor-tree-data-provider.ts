import * as vscode from 'vscode';
import * as path from 'path';

export class MonitorTreeDataProvider implements vscode.TreeDataProvider<MonitorItem> {

    constructor() {
	}
    onDidChangeTreeData?: vscode.Event<void | MonitorItem | null | undefined> | undefined;
    getTreeItem(element: MonitorItem): vscode.TreeItem | Thenable<vscode.TreeItem> {
        return element;
    }
    getChildren(element?: MonitorItem): vscode.ProviderResult<MonitorItem[]> {
        return [
            new MonitorItem('View System Information', '', vscode.TreeItemCollapsibleState.None, {
                command: 'systemMonitor.start',
                title: 'Start System Monitor',
                arguments: ['memory']
            })
        ];
    }

}

export class MonitorItem extends vscode.TreeItem {

	constructor(
		public readonly label: string,
		private readonly version: string,
		public readonly collapsibleState: vscode.TreeItemCollapsibleState,
		public readonly command?: vscode.Command,
	) {
		super(label, collapsibleState);
		this.tooltip = `${this.label}-${this.version}`;
		this.description = this.version;
        this.iconPath = {
            light: path.join(__filename, '..', '..', '..', 'media', 'system_dark.svg'),
            dark: path.join(__filename, '..', '..', '..', 'media', 'system_light.svg')
        };
	}
}