import * as vscode from 'vscode'
import { registerReportCommand } from '../commands'

let alreadyRegistered = false

const statusBar = () => {
	vscode.window
		.showInformationMessage(
			'Lenix commit message composer',
			'Open Lenix in settings',
		)
		.then(action => {
			if (action === 'Open Lenix in settings')
				vscode.commands.executeCommand(
					'workbench.action.openSettings',
					'lenix.',
				)
		})
}

const setup = (handler: () => void) => {
	vscode.window
		.showInformationMessage(
			"Seems like you don't have an API key set, let's do that first",
			'Use Setup Page (recommended)',
			'Setup manually in settings',
		)
		.then(action => {
			if (action === 'Use Setup Page (recommended)') handler()
			else if (action === 'Setup manually in settings')
				vscode.commands.executeCommand(
					'workbench.action.openSettings',
					'lenix.apiKey',
				)
		})
}

const report = (racedList: string[], bar: vscode.StatusBarItem) => {
	if (!alreadyRegistered) {
		registerReportCommand(racedList, bar)
		alreadyRegistered = true
	}
	bar.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground')
	bar.text = '$(warning) Lenix'
	bar.command = 'lenix.report'
	vscode.window
		.showWarningMessage(
			`
    Lenix: Models not in local list: ${racedList}.
    Report this issue and it'll be fixed immediately, we promise ;),
    all you need to do is just copy the issue title: 'AI Models raced' and past it there, that's it :), appreciate you!
  `,
			'Report Issue',
		)
		.then(action => {
			if (action === 'Report Issue') {
				vscode.env.openExternal(
					vscode.Uri.parse('https://github.com/lehnhix/commenix/issues/new'),
				)
				bar.backgroundColor = undefined
				bar.text = '$(edit-sparkle) Lenix'
				bar.command = 'lenix.settings'
			}
		})
}

export default {
	setup,
	statusBar,
	report,
}
