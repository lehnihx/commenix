import * as vscode from 'vscode'
import Ai from 'groq-sdk'
import { setup } from '../setup'
import notify from '../notify'
import { logger } from '../logger'

const MAX_DIFF_TOKENS = 3000 as const
const defaultModel = 'openai/gpt-oss-120b' as const
const models: readonly string[] = [
	'allam-2-7b',
	'canopylabs/orpheus-arabic-saudi',
	'canopylabs/orpheus-v1-english',
	'groq/compound',
	'groq/compound-mini',
	'llama-3.1-8b-instant',
	'llama-3.3-70b-versatile',
	'meta-llama/llama-4-scout-17b-16e-instruct',
	'meta-llama/llama-prompt-guard-2-22m',
	'meta-llama/llama-prompt-guard-2-86m',
	'moonshotai/kimi-k2-instruct',
	'moonshotai/kimi-k2-instruct-0905',
	'openai/gpt-oss-120b',
	'openai/gpt-oss-20b',
	'openai/gpt-oss-safeguard-20b',
	'qwen/qwen3-32b',
	'whisper-large-v3',
	'whisper-large-v3-turbo',
]
let constructedInstance: false | Ai = false
let availableModels: string[] = []
let modelChecked = false

const updateAiKey = (apiKey: string) => {
	if (!constructedInstance || constructedInstance.apiKey !== apiKey) {
		constructedInstance = new Ai({ apiKey })
	}
	return constructedInstance
}

const checkAiModelsRace = async (apiKey: string, bar: vscode.StatusBarItem) => {
	if (modelChecked) return
	const res = await fetch('https://api.groq.com/openai/v1/models', {
		headers: { Authorization: `Bearer ${apiKey}` },
	})
	const data = (await res.json()) as {
		data: {
			id: (typeof models)[number]
		}[]
		error: { message: string; code: string }
	}
	try {
		availableModels = data.data.map(m => m.id)
		const racedList = availableModels.filter(m => !models.includes(m))
		if (racedList.length > 0) {
			notify.report(racedList, bar)
		}

		modelChecked = true
	} catch (e) {
		logger.log(String(e))
	}
}

export const composeCommitMessage = async (
	context: vscode.ExtensionContext,
	bar: vscode.StatusBarItem,
): Promise<void> => {
	const gitExtension = vscode.extensions.getExtension('vscode.git')?.exports
	if (!gitExtension) {
		vscode.window.showErrorMessage('Lenix: Git extension not available')
		return
	}

	const git = gitExtension.getAPI(1)
	const repo = git.repositories.find((r: any) => r.ui.selected)
	if (!repo) {
		vscode.window.showErrorMessage('Lenix: No git repository found')
		return
	}

	if (!vscode.workspace.workspaceFolders?.[0]) {
		vscode.window.showErrorMessage('Lenix: No workspace open')
		return
	}

	await repo.status()
	const diff = await repo.diff(true)
	if (!diff) {
		vscode.window.showErrorMessage('Lenix: No changes staged for commit')
		return
	}

	const model = vscode.workspace
		.getConfiguration('lenix')
		.get<string>('aiModel')
	if (!model) {
		vscode.window.showErrorMessage(
			'Lenix: Unexpected: No model selected',
		)
		return
	}

	const apiKey = vscode.workspace
		.getConfiguration('lenix')
		.get<string>('apiKey')
	if (!apiKey)
		return notify.setup(() => setup(context, defaultModel, models as string[]))

	await checkAiModelsRace(apiKey, bar)
	const ai = updateAiKey(apiKey)
	const truncatedDiff =
		diff.length > MAX_DIFF_TOKENS ?
			diff.slice(0, MAX_DIFF_TOKENS) + '\n... (truncated)'
		:	diff
	const branch = repo.state.HEAD?.name ?? ''
	const files = repo.state.indexChanges.map((c: any) => c.uri.fsPath).join('\n')

	try {
		vscode.window.withProgress(
			{
				location: vscode.ProgressLocation.SourceControl,
				title: 'Composing commit message...',
				cancellable: false,
			},
			async () => {
				try {
					const response = await ai.chat.completions.create({
						model,
						messages: [
							{
								role: 'user',
								content: `Generate a single git commit message following Conventional Commits format (type(scope): description).
Return only the commit message, no explanation, no quotes, no alternatives.
IMPORTANT: Your response must be a single line only. No markdown, no explanation, no reasoning, no alternatives. Only the commit message itself.

Branch: ${branch}
Files changed: ${files}

Diff:
${truncatedDiff}`,
							},
						],
					})
					const commitMessage = response.choices[0].message.content
					if (typeof commitMessage !== 'string')
						return vscode.window.showErrorMessage(
							'Lenix: Expected the response from the LLM to have a string in nest',
						)

					const lastHead = repo.state.HEAD?.commit
					repo.inputBox.value = commitMessage

					vscode.window.withProgress(
						{
							location: vscode.ProgressLocation.Window,
							title:
								'Lenix: Please review the commit message before committing',
						},
						() =>
							new Promise<void>(resolve => {
								const listener = repo.state.onDidChange(() => {
									if (repo.state.HEAD?.commit !== lastHead) {
										listener.dispose()
										resolve()
									}
								})
							}),
					)
				} catch (error: any) {
					vscode.window
						.showErrorMessage(
							`CODE: ${error.error.error.code}. MESSAGE: ${error.error.error.message}.`,
							'Upgrade',
							'Change Model',
						)
						.then(action => {
							if (action === 'Upgrade')
								vscode.env.openExternal(
									vscode.Uri.parse('https://console.groq.com/settings/billing'),
								)
							else if (action === 'Change Model')
								vscode.commands.executeCommand(
									'workbench.action.openSettings',
									'lenix.aiModel',
								)
						})
				}
			},
		)
	} catch (error) {
		vscode.window.showErrorMessage('Lenix: Composer throwed')
		throw error
	}
}
