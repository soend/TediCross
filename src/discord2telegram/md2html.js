"use strict";

const simpleMarkdown = require("simple-markdown");
const { escapeHTMLSpecialChars } = require("./helpers");
const R = require("ramda");

/***********
 * Helpers *
 ***********/

/** Map between content types and their HTML tags */
const tagMap = new Proxy(
	{
		u: "u",
		strong: "b",
		em: "em",
		inlineCode: "code",
		codeBlock: "pre"
	},
	{
		get(target, prop) {
			// Default to not having any tags
			const tags = {
				start: "",
				end: ""
			};
			// Check if tags are defined for this type
			if (prop in target) {
				// Create the proper tags
				tags.start = `<${target[prop]}>`;
				tags.end = `</${target[prop]}>`;
			}
			return tags;
		}
	}
);

/** Syntax tree node representing a newline */
const newlineNode = { content: "\n", type: "text" };

/**
 * Extracts pure texts from a node and its child nodes
 *
 * @param {Object} node	The syntax tree node to extract text from
 *
 * @return {String}	The concatenated text from all leaf nodes of this node
 */
function extractText(node) {
	// Extract the text from the node
	let text = node.content;
	if (node.content instanceof Array) {
		// The content was apparently not text... Recurse downward
		text = node.content.map(extractText).join("");
	}
	return text;
}

/*********************
 * Set up the parser *
 *********************/

// Ignore some rules which only creates trouble
["list", "heading"].forEach(type => {
	simpleMarkdown.defaultRules[type] = {
		order: Number.POSITIVE_INFINITY,
		match: () => null // Never match anything in order to ignore this rule
	};
});

// Shorthand for the parser
const mdParse = simpleMarkdown.defaultBlockParse;

/*****************************
 * Make the parsing function *
 *****************************/

/**
 * Parse Discord's Markdown format to Telegram-accepted HTML
 *
 * @param {String} text	The markdown string to convert
 *
 * @return {String}	Telegram-friendly HTML
 */
function md2html(text) {
	// XXX Some users get a space after @ in mentions bridged to Telegram. See #148
	// This is compensation for that discord error
	text = R.replace("@\u200B", "@", R.defaultTo("", text));

	// Escape HTML in the input
	const processedText = escapeHTMLSpecialChars(text);

	// Parse the markdown and build HTML out of it
	const html = mdParse(processedText)
		.map(rootNode => {
			// Do some node preprocessing
			let content = rootNode; // Default to just keeping the node
			if (rootNode.type === "paragraph") {
				// Remove the outer paragraph, if one exists
				content = rootNode.content;
			}
			return content;
		})
		// Flatten the resulting structure
		.reduce((flattened, nodes) => flattened.concat([newlineNode, newlineNode], nodes), [])
		// Remove the two initial newlines created by the previous line
		.slice(2)
		.reduce((html, node) => {
			// Turn the nodes into HTML
			// Telegram doesn't support nested tags, so only apply tags to the outer nodes
			// Get the tag type of this node
			const tags = tagMap[node.type];

			// Build the HTML
			return html + `${tags.start}${extractText(node)}${tags.end}`;
		}, "");

	return html;
}

/***********************
 * Export the function *
 ***********************/

module.exports = md2html;
