// Port of compilerla/conventional-pre-commit v4.5.0 (Apache-2.0), default options:
// https://github.com/compilerla/conventional-pre-commit/blob/v4.5.0/conventional_pre_commit/format.py
// Changed: rewritten in TypeScript for Bun, color and CLI options dropped.

const TYPES = [
	"build",
	"chore",
	"ci",
	"docs",
	"feat",
	"fix",
	"perf",
	"refactor",
	"revert",
	"style",
	"test",
];

const VERBOSE_IGNORED = /^# -{24} >8 -{24}\r?\n[\s\S]*$/mu;
const COMMENT = /^#.*\r?\n?/gmu;
const AUTOSQUASH = /^(?:amend|fixup|squash)! /u;
const MERGE = /^merge\b/iu;
const CONVENTIONAL = new RegExp(
	`^(?:${TYPES.join("|")})(?:\\([\\w :,\\-/.#]+\\))?!?: .+$(?<body>\\r?\\n(?<sep>^$\\r?\\n)?(?<break>BREAKING[ -]CHANGE: )?.+)?`,
	"imu",
);

const clean = (message: string): string =>
	message.replace(VERBOSE_IGNORED, "").replaceAll(COMMENT, "");

export const isConventional = (message: string): boolean => {
	const commit = clean(message) || message;
	if (AUTOSQUASH.test(commit) || MERGE.test(commit)) {
		return true;
	}
	const groups = CONVENTIONAL.exec(commit)?.groups;
	if (groups === undefined) {
		return false;
	}
	const { body, sep, break: breaking } = groups;
	return (
		body === undefined ||
		(sep !== undefined &&
			(breaking === undefined || breaking === breaking.toUpperCase()))
	);
};

/** Exit code for the commit message file at `path`. */
export const checkFile = async (path?: string): Promise<number> => {
	if (path !== undefined && isConventional(await Bun.file(path).text())) {
		return 0;
	}
	console.error(
		`commit-msg: use Conventional Commits, for example "feat(cli): add --dry-run".
Types: ${TYPES.join(", ")}. https://www.conventionalcommits.org`,
	);
	return 1;
};
