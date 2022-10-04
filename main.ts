import { App, Editor, FuzzySuggestModal, MarkdownView, Notice, Plugin } from 'obsidian';


interface SaySettings {
	voiceName: string;
	pitch: number;
	rate: number;
	recentVoices: string[]
}

const DEFAULT_SETTINGS: SaySettings = {
	voiceName: "",
	pitch: 1,
	rate: 1,
	recentVoices: [],
}
class PopoverSelectString extends FuzzySuggestModal<string> {
	app: App;
	callback: ((e: string) => void) | null = () => { };
	getItemsFun: () => string[] = () => {
		return ["yes", "no"];

	}

	constructor(app: App, note: string, placeholder: string | null, getItemsFun: () => string[], callback: (e: string) => void) {
		super(app);
		this.app = app;
		this.setPlaceholder((placeholder ?? "y/n) ") + note);
		if (getItemsFun) this.getItemsFun = getItemsFun;
		this.callback = callback;
	}

	getItems(): string[] {
		return this.getItemsFun();
	}

	getItemText(item: string): string {
		return item;
	}

	onChooseItem(item: string, evt: MouseEvent | KeyboardEvent): void {
		// debugger;
		if (this.callback) {
			this.callback(item);
			this.callback = null;
		}
	}
	onClose(): void {
		setTimeout(() => {
			if (this.callback != null) {
				this.callback("");
			}
		}, 100);
	}
}
const askSelectString = (app: App, message: string, items: string[]): Promise<string> => {
	const getItemsFun = () => items;
	return new Promise((res) => {
		const popover = new PopoverSelectString(app, message, "", getItemsFun, (result) => res(result));
		popover.open();
	});
};


// For shorthand.
const ss = window.speechSynthesis;

export default class SayPlugin extends Plugin {
	settings: SaySettings;
	voiceList: SpeechSynthesisVoice[] = [];
	lastSpokenWord: string;

	isSupported() {
		if ("speechSynthesis" in window) {
			return true;
		}
		return false;
	}

	speak(strMessage: string) {
		if (ss.speaking) ss.cancel();
		const utter = new SpeechSynthesisUtterance(strMessage);
		const voice = this.voiceList.find(e => e.name == this.settings.voiceName);
		if (voice) {
			utter.lang = voice.lang;
			utter.voice = voice;
		}
		utter.rate = this.settings.rate;
		utter.pitch = this.settings.pitch;
		ss.speak(utter);
	}
	addVoices() {
		const voices = speechSynthesis.getVoices();
		this.voiceList = [];
		for (const voice of voices) {
			this.voiceList = [...new Set([...this.voiceList, voice])].sort((a, b) => a.lang.localeCompare(b.lang));
		}
	}
	async selectVoices(sayItAgain: boolean) {
		const voices = {} as { [key: string]: string[] };
		voices["recent"] = [...this.settings.recentVoices];
		for (const voice of this.voiceList) {
			const lang = voice.lang;
			if (!(lang in voices)) {
				voices[lang] = [];
			}
			voices[lang].push(voice.name);
		}
		const lang = await askSelectString(this.app, "Select locale of the voice", Object.keys(voices));
		const voice = await askSelectString(this.app, "Select locale of the voice", voices[lang]);
		if (voice) {
			if (this.settings.recentVoices.first() != voice) {
				this.settings.recentVoices.unshift(voice);
				this.settings.recentVoices = this.settings.recentVoices.filter(e => `${e}`.trim() != "");
				this.settings.recentVoices = this.settings.recentVoices.slice(0, 10);
			}
			this.settings.voiceName = voice;
			await this.saveSettings();
			if (sayItAgain) {
				this.speak(this.lastSpokenWord);
			}
		}
	}
	async selectPitch() {
		const pitches = [0.5, 0.75, 1, 1.25, 1.5];

		const pitch = await askSelectString(this.app, "Select pitch of the voice (Higher is high)", pitches.map(e => `${e}`));
		this.settings.pitch = Number(pitch);
		await this.saveSettings();
	}
	async selectRate() {
		const rates = [0.5, 0.75, 1, 1.25, 1.5];

		const rate = await askSelectString(this.app, "Select pitch of the voice (Higher is faster)", rates.map(e => `${e}`));
		this.settings.rate = Number(rate);
		await this.saveSettings();
	}
	async onload() {
		await this.loadSettings();
		this.addVoices = this.addVoices.bind(this);
		if (!this.isSupported()) {
			new Notice("Text-to-speech is not supported on your device.")
			return;
		}
		this.addVoices();
		speechSynthesis.addEventListener("voiceschanged", this.addVoices);

		//Add commands
		this.addCommand({
			id: 'select-language-and-voice',
			name: 'Select language and voice',
			callback: () => {
				this.selectVoices(false);
			}
		});
		this.addCommand({
			id: 'select-pitch',
			name: 'Select pitch',
			callback: () => {
				this.selectPitch();
			}
		});
		this.addCommand({
			id: 'select-rate',
			name: 'Select rate',
			callback: () => {
				this.selectRate();
			}
		});
		this.addCommand({
			id: 'say-it-again',
			name: 'Repeat the last spoken',
			callback: () => {
				this.speak(this.lastSpokenWord);
			}
		});
		this.addCommand({
			id: 'say-it-again-in-another-voice',
			name: 'Repeat the last spoken in another voice.',
			callback: () => {
				this.selectVoices(true);
			}
		});

		// The main command
		this.addCommand({
			id: 'say',
			name: 'Say',
			editorCallback: (editor: Editor, view: MarkdownView) => {
				this.lastSpokenWord = editor.getSelection();
				this.speak(this.lastSpokenWord);
			}
		});
	}

	onunload() {
		if (this.isSupported()) {
			speechSynthesis.removeEventListener("voiceschanged", this.addVoices)
		}
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}
