export interface Greeting {
	readonly name: string;
	readonly punctuation?: "!" | ".";
}

export const greet = ({ name, punctuation = "!" }: Greeting): string =>
	`Hello, ${name}${punctuation}`;
