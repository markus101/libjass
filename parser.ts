/**
 * libjass
 *
 * https://github.com/Arnavion/libjass
 *
 * Copyright 2013 Arnav Singh
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *    http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

///<reference path="libjass.ts" />

module libjass.parser {
	/**
	 * Parses a given string with the specified rule.
	 *
	 * @param {string} input
	 * @param {string="dialogueParts"} startRule
	 * @return {*}
	 */
	export function parse(input: string, rule: string = "dialogueParts"): any {
		var run = new ParserRun(input, rule);

		if (run.result === null || run.result.end !== input.length) {
			throw new Error("Parse failed.");
		}

		return run.result.value;
	}

	class ParserRun {
		private _parseTree: ParseNode = new ParseNode(null);
		private _result: ParseNode;

		constructor(private _input: string, rule: string) {
			this._result = rules.get(rule).call(this, this._parseTree);
		}

		get result(): ParseNode {
			return this._result;
		}

		parse_script(parent: ParseNode): ParseNode {
			var current = new ParseNode(parent);

			current.value = Object.create(null);

			while (this._haveMore()) {
				var scriptSectionNode = this.parse_scriptSection(current);

				if (scriptSectionNode !== null) {
					current.value[scriptSectionNode.value.name] = scriptSectionNode.value.contents;
				}
				else if (this.read(current, "\n") === null) {
					parent.pop();
					return null;
				}
			}

			return current;
		}

		parse_scriptSection(parent: ParseNode): ParseNode {
			var current = new ParseNode(parent);

			current.value = Object.create(null);
			current.value.contents = null;

			var sectionHeaderNode = this.parse_scriptSectionHeader(current);
			if (sectionHeaderNode === null) {
				parent.pop();
				return null;
			}

			current.value.name = sectionHeaderNode.value;

			var formatSpecifier: string[] = null;

			while(this._haveMore() && this._peek() !== "[") {
				var propertyNode = this.parse_scriptProperty(current);

				if (propertyNode !== null) {
					var property = propertyNode.value;

					if (property.key === "Format") {
						formatSpecifier = property.value.split(",").map((formatPart: string) => formatPart.trim());
					}

					else if (formatSpecifier !== null) {
						if (current.value.contents === null) {
							current.value.contents = <any[]>[];
						}

						var template = Object.create(null);
						var value = property.value.split(",");

						if (value.length > formatSpecifier.length) {
							value[formatSpecifier.length - 1] = value.slice(formatSpecifier.length - 1).join(",");
						}

						formatSpecifier.forEach((formatKey, index) => {
							template[formatKey] = value[index];
						});

						current.value.contents.push({ type: property.key, template: template });
					}

					else {
						if (current.value.contents === null) {
							current.value.contents = Object.create(null);
						}

						current.value.contents[property.key] = property.value;
					}
				}

				else if (this.parse_scriptComment(current) === null && this.read(current, "\n") === null) {
					parent.pop();
					return null;
				}
			}

			return current;
		}

		parse_scriptSectionHeader(parent: ParseNode): ParseNode {
			var current = new ParseNode(parent);

			if (this.read(current, "[") === null) {
				parent.pop();
				return null;
			}

			var nameNode = new ParseNode(current, "");

			for (var next = this._peek(); this._haveMore() && next !== "]" && next !== "\n"; next = this._peek()) {
				nameNode.value += next;
			}

			if (nameNode.value.length === 0) {
				parent.pop();
				return null;
			}

			current.value = nameNode.value;

			if (this.read(current, "]") === null) {
				parent.pop();
				return null;
			}

			return current;
		}

		parse_scriptProperty(parent: ParseNode): ParseNode {
			var current = new ParseNode(parent);

			current.value = Object.create(null);

			var keyNode = new ParseNode(current, "");

			var next: string;

			for (next = this._peek(); this._haveMore() && next !== ":" && next !== "\n"; next = this._peek()) {
				keyNode.value += next;
			}

			if (keyNode.value.length === 0) {
				parent.pop();
				return null;
			}

			if (this.read(current, ":") === null) {
				parent.pop();
				return null;
			}

			var spacesNode = new ParseNode(current, "");

			for (next = this._peek(); next === " "; next = this._peek()) {
				spacesNode.value += next;
			}

			var valueNode = new ParseNode(current, "");

			for (next = this._peek(); this._haveMore() && next !== "\n"; next = this._peek()) {
				valueNode.value += next;
			}

			current.value.key = keyNode.value;
			current.value.value = valueNode.value;

			return current;
		}

		parse_scriptComment(parent: ParseNode): ParseNode {
			var current = new ParseNode(parent);

			if (this.read(current, ";") === null) {
				parent.pop();
				return null;
			}

			var valueNode = new ParseNode(current, "");
			for (var next = this._peek(); this._haveMore() && next !== "\n"; next = this._peek()) {
				valueNode.value += next;
			}

			current.value = valueNode.value;

			return current;
		}

		parse_dialogueParts(parent: ParseNode): ParseNode {
			var current = new ParseNode(parent);

			current.value = [];

			while (this._haveMore()) {
				var enclosedTagsNode = this.parse_enclosedTags(current);

				if (enclosedTagsNode !== null) {
					current.value.push.apply(current.value, enclosedTagsNode.value);
				}

				else {
					var spacingNode = this.parse_newline(current) || this.parse_hardspace(current);

					if (spacingNode !== null) {
						current.value.push(spacingNode.value);
					}

					else {
						var textNode = this.parse_text(current);

						if (textNode !== null) {
							if (current.value[current.value.length - 1] instanceof tags.Text) {
								// Merge consecutive text parts into one part
								current.value[current.value.length - 1] =
									new tags.Text(
										(<tags.Text>current.value[current.value.length - 1]).value +
										(<tags.Text>textNode.value).value
									);
							}
							else {
								current.value.push(textNode.value);
							}
						}

						else {
							parent.pop();
							return null;
						}
					}
				}
			}

			return current;
		}

		parse_enclosedTags(parent: ParseNode): ParseNode {
			var current = new ParseNode(parent);

			current.value = [];

			if (this.read(current, "{") === null) {
				parent.pop();
				return null;
			}

			for (var next = this._peek(); this._haveMore() && next !== "}"; next = this._peek()) {
				var childNode: ParseNode = null;

				if (this.read(current, "\\") !== null) {
					childNode =
						this.parse_tag_alpha(current) ||
						this.parse_tag_iclip(current) ||
						this.parse_tag_xbord(current) ||
						this.parse_tag_ybord(current) ||
						this.parse_tag_xshad(current) ||
						this.parse_tag_yshad(current) ||

						this.parse_tag_blur(current) ||
						this.parse_tag_bord(current) ||
						this.parse_tag_clip(current) ||
						this.parse_tag_fade(current) ||
						this.parse_tag_fscx(current) ||
						this.parse_tag_fscy(current) ||
						this.parse_tag_move(current) ||
						this.parse_tag_shad(current) ||

						this.parse_tag_fad(current) ||
						this.parse_tag_fax(current) ||
						this.parse_tag_fay(current) ||
						this.parse_tag_frx(current) ||
						this.parse_tag_fry(current) ||
						this.parse_tag_frz(current) ||
						this.parse_tag_fsp(current) ||
						this.parse_tag_org(current) ||
						this.parse_tag_pbo(current) ||
						this.parse_tag_pos(current) ||

						this.parse_tag_an(current) ||
						this.parse_tag_be(current) ||
						this.parse_tag_fn(current) ||
						this.parse_tag_fr(current) ||
						this.parse_tag_fs(current) ||
						this.parse_tag_kf(current) ||
						this.parse_tag_ko(current) ||
						this.parse_tag_1a(current) ||
						this.parse_tag_1c(current) ||
						this.parse_tag_2a(current) ||
						this.parse_tag_2c(current) ||
						this.parse_tag_3a(current) ||
						this.parse_tag_3c(current) ||
						this.parse_tag_4a(current) ||
						this.parse_tag_4c(current) ||

						this.parse_tag_a(current) ||
						this.parse_tag_b(current) ||
						this.parse_tag_c(current) ||
						this.parse_tag_i(current) ||
						this.parse_tag_k(current) ||
 						this.parse_tag_K(current) ||
						this.parse_tag_p(current) ||
						this.parse_tag_q(current) ||
						this.parse_tag_r(current) ||
						this.parse_tag_s(current) ||
						this.parse_tag_t(current) ||
						this.parse_tag_u(current);

					if (childNode === null) {
						current.pop(); // Unread backslash
					}
				}

				if (childNode === null) {
					childNode = this.parse_comment(current);
				}

				if (childNode !== null) {
					if (childNode.value instanceof tags.Comment && current.value[current.value.length - 1] instanceof tags.Comment) {
						// Merge consecutive comment parts into one part
						current.value[current.value.length - 1] =
							new tags.Comment(
								(<tags.Comment>current.value[current.value.length - 1]).value +
								(<tags.Comment>childNode.value).value
							);
					}
					else {
						current.value.push(childNode.value);
					}
				}
				else {
					parent.pop();
					return null;
				}
			}

			if (this.read(current, "}") === null) {
				parent.pop();
				return null;
			}

			return current;
		}

		parse_newline(parent: ParseNode): ParseNode {
			var current = new ParseNode(parent);

			if (this.read(current, "\\N") === null) {
				parent.pop();
				return null;
			}

			current.value = new tags.NewLine();

			return current;
		}

		parse_hardspace(parent: ParseNode): ParseNode {
			var current = new ParseNode(parent);

			if (this.read(current, "\\h") === null) {
				parent.pop();
				return null;
			}

			current.value = new tags.HardSpace();

			return current;
		}

		parse_text(parent: ParseNode): ParseNode {
			var value = this._peek();

			var current = new ParseNode(parent);
			var valueNode = new ParseNode(current, value);

			current.value = new tags.Text(valueNode.value);

			return current;
		}

		parse_comment(parent: ParseNode): ParseNode {
			var value = this._peek();

			var current = new ParseNode(parent);
			var valueNode = new ParseNode(current, value);

			current.value = new tags.Comment(valueNode.value);

			return current;
		}

		parse_tag_a(parent: ParseNode): ParseNode {
			var current = new ParseNode(parent);

			if (this.read(current, "a") === null) {
				parent.pop();
				return null;
			}

			var next = this._peek();

			switch (next) {
				case "1":
					var next2 = this._peek(2);

					switch(next2) {
						case "10":
						case "11":
							next = next2;
							break;
					}

					break;

				case "2":
				case "3":
				case "5":
				case "6":
				case "7":
				case "9":
					break;

				default:
					parent.pop();
					return null;
			}

			var valueNode = new ParseNode(current, next);

			var value: number = null;
			switch (valueNode.value) {
				case "1":
					value = 1;
					break;

				case "2":
					value = 2;
					break;

				case "3":
					value = 3;
					break;

				case "5":
					value = 7;
					break;

				case "6":
					value = 8;
					break;

				case "7":
					value = 9;
					break;

				case "9":
					value = 4;
					break;

				case "10":
					value = 5;
					break;

				case "11":
					value = 6;
					break;
			}

			current.value = new tags.Alignment(value);

			return current;
		}

		parse_tag_alpha(parent: ParseNode): ParseNode {
			throw new Error("Method not implemented.");
		}

		parse_tag_an(parent: ParseNode): ParseNode {
			var current = new ParseNode(parent);

			if (this.read(current, "an") === null) {
				parent.pop();
				return null;
			}

			var next = this._peek();

			if (next < "1" || next > "9") {
				parent.pop();
				return null;
			}

			var valueNode = new ParseNode(current, next);

			current.value = new tags.Alignment(parseInt(valueNode.value));

			return current;
		}

		parse_tag_b(parent: ParseNode): ParseNode {
			var current = new ParseNode(parent);

			if (this.read(current, "b") === null) {
				parent.pop();
				return null;
			}

			var valueNode: ParseNode = null;

			var next = this._peek();

			if (next >= "1" && next <= "9") {
				next = this._peek(3);
				if (next.substr(1) === "00") {
					valueNode = new ParseNode(current, next);
					valueNode.value = parseInt(valueNode.value);
				}
			}

			if (valueNode === null) {
				valueNode = this.parse_enableDisable(current);
			}

			if (valueNode !== null) {
				current.value = new tags.Bold(valueNode.value);
			}
			else {
				current.value = new tags.Bold(null);
			}

			return current;
		}

		parse_tag_be(parent: ParseNode): ParseNode {
			throw new Error("Method not implemented.");
		}

		parse_tag_blur(parent: ParseNode): ParseNode {
			throw new Error("Method not implemented.");
		}

		parse_tag_bord(parent: ParseNode): ParseNode {
			throw new Error("Method not implemented.");
		}

		parse_tag_c(parent: ParseNode): ParseNode {
			throw new Error("Method not implemented.");
		}

		parse_tag_clip(parent: ParseNode): ParseNode {
			var current = new ParseNode(parent);

			if (this.read(current, "clip") === null) {
				parent.pop();
				return null;
			}

			var x1Node: ParseNode = null;
			var x2Node: ParseNode = null;
			var y1Node: ParseNode = null;
			var y2Node: ParseNode = null;
			var scaleNode: ParseNode = null;
			var commandsNode: ParseNode = null;

			var firstNode = this.parse_decimal(current);

			if (firstNode !== null) {
				if (this.read(current, ",") === null) {
					parent.pop();
					return null;
				}

				var secondNode = this.parse_decimal(current);

				if (secondNode !== null) {
					x1Node = firstNode;
					y1Node = secondNode;
				}
				else {
					scaleNode = firstNode;
				}
			}

			if (x1Node !== null && y1Node !== null) {
				if (this.read(current, ",") === null) {
					parent.pop();
					return null;
				}

				x2Node = this.parse_decimal(current);

				if (this.read(current, ",") === null) {
					parent.pop();
					return null;
				}

				y2Node = this.parse_decimal(current);

				current.value = new tags.RectangularClip(x1Node.value, y1Node.value, x2Node.value, y2Node.value, true);
			}
			else {
				commandsNode = new ParseNode(current, "");

				for (var next = this._peek(); this._haveMore() && next !== ")" && next !== "}"; next = this._peek()) {
					commandsNode.value += next;
				}

				current.value = new tags.VectorClip((scaleNode !== null) ? scaleNode.value : 1, commandsNode.value, true);
			}

			if (this.read(current, ")") === null) {
				parent.pop();
				return null;
			}

			return current;
		}

		parse_tag_fad(parent: ParseNode): ParseNode {
			var current = new ParseNode(parent);

			if (this.read(current, "fad") === null) {
				parent.pop();
				return null;
			}

			if (this.read(current, "(") === null) {
				parent.pop();
				return null;
			}

			var startNode = this.parse_decimal(current);
			if (startNode === null) {
				parent.pop();
				return null;
			}

			if (this.read(current, ",") === null) {
				parent.pop();
				return null;
			}

			var endNode = this.parse_decimal(current);
			if (endNode === null) {
				parent.pop();
				return null;
			}

			if (this.read(current, ")") === null) {
				parent.pop();
				return null;
			}

			current.value = new tags.Fade(startNode.value / 1000, endNode.value / 1000);

			return current;
		}

		parse_tag_fade(parent: ParseNode): ParseNode {
			var current = new ParseNode(parent);

			if (this.read(current, "fade") === null) {
				parent.pop();
				return null;
			}

			if (this.read(current, "(") === null) {
				parent.pop();
				return null;
			}

			var a1Node = this.parse_decimal(current);
			if (a1Node === null) {
				parent.pop();
				return null;
			}

			if (this.read(current, ",") === null) {
				parent.pop();
				return null;
			}

			var a2Node = this.parse_decimal(current);
			if (a2Node === null) {
				parent.pop();
				return null;
			}

			if (this.read(current, ",") === null) {
				parent.pop();
				return null;
			}

			var a3Node = this.parse_decimal(current);
			if (a3Node === null) {
				parent.pop();
				return null;
			}

			if (this.read(current, ",") === null) {
				parent.pop();
				return null;
			}

			var t1Node = this.parse_decimal(current);
			if (t1Node === null) {
				parent.pop();
				return null;
			}

			if (this.read(current, ",") === null) {
				parent.pop();
				return null;
			}

			var t2Node = this.parse_decimal(current);
			if (t2Node === null) {
				parent.pop();
				return null;
			}

			if (this.read(current, ",") === null) {
				parent.pop();
				return null;
			}

			var t3Node = this.parse_decimal(current);
			if (t3Node === null) {
				parent.pop();
				return null;
			}

			if (this.read(current, ",") === null) {
				parent.pop();
				return null;
			}

			var t4Node = this.parse_decimal(current);
			if (t4Node === null) {
				parent.pop();
				return null;
			}

			if (this.read(current, ")") === null) {
				parent.pop();
				return null;
			}

			current.value =
				new tags.ComplexFade(
					1 - a1Node.value / 255, 1 - a2Node.value / 255, 1 - a3Node.value / 255,
					t1Node.value / 1000, t2Node.value / 1000, t3Node.value / 1000, t4Node.value / 1000
				);

			return current;
		}

		parse_tag_fax(parent: ParseNode): ParseNode {
			throw new Error("Method not implemented.");
		}

		parse_tag_fay(parent: ParseNode): ParseNode {
			throw new Error("Method not implemented.");
		}

		parse_tag_fn(parent: ParseNode): ParseNode {
			var current = new ParseNode(parent);

			if (this.read(current, "fn") === null) {
				parent.pop();
				return null;
			}

			var valueNode = new ParseNode(current, "");

			for (var next = this._peek(); this._haveMore() && next !== "\\" && next !== "}"; next = this._peek()) {
				valueNode.value += next;
			}

			if (valueNode.value.length > 0) {
				current.value = new tags.FontName(valueNode.value);
			}
			else {
				current.value = new tags.FontName(null);
			}

			return current;
		}

		parse_tag_fr(parent: ParseNode): ParseNode {
			throw new Error("Method not implemented.");
		}

		parse_tag_frx(parent: ParseNode): ParseNode {
			throw new Error("Method not implemented.");
		}

		parse_tag_fry(parent: ParseNode): ParseNode {
			throw new Error("Method not implemented.");
		}

		parse_tag_frz(parent: ParseNode): ParseNode {
			throw new Error("Method not implemented.");
		}

		parse_tag_fs(parent: ParseNode): ParseNode {
			throw new Error("Method not implemented.");
		}

		parse_tag_fscx(parent: ParseNode): ParseNode {
			throw new Error("Method not implemented.");
		}

		parse_tag_fscy(parent: ParseNode): ParseNode {
			throw new Error("Method not implemented.");
		}

		parse_tag_fsp(parent: ParseNode): ParseNode {
			throw new Error("Method not implemented.");
		}

		parse_tag_i(parent: ParseNode): ParseNode {
			throw new Error("Method not implemented.");
		}

		parse_tag_iclip(parent: ParseNode): ParseNode {
			var current = new ParseNode(parent);

			if (this.read(current, "iclip") === null) {
				parent.pop();
				return null;
			}

			var x1Node: ParseNode = null;
			var x2Node: ParseNode = null;
			var y1Node: ParseNode = null;
			var y2Node: ParseNode = null;
			var scaleNode: ParseNode = null;
			var commandsNode: ParseNode = null;

			var firstNode = this.parse_decimal(current);

			if (firstNode !== null) {
				if (this.read(current, ",") === null) {
					parent.pop();
					return null;
				}

				var secondNode = this.parse_decimal(current);

				if (secondNode !== null) {
					x1Node = firstNode;
					y1Node = secondNode;
				}
				else {
					scaleNode = firstNode;
				}
			}

			if (x1Node !== null && y1Node !== null) {
				if (this.read(current, ",") === null) {
					parent.pop();
					return null;
				}

				x2Node = this.parse_decimal(current);

				if (this.read(current, ",") === null) {
					parent.pop();
					return null;
				}

				y2Node = this.parse_decimal(current);

				current.value = new tags.RectangularClip(x1Node.value, y1Node.value, x2Node.value, y2Node.value, false);
			}
			else {
				commandsNode = new ParseNode(current, "");

				for (var next = this._peek(); this._haveMore() && next !== ")" && next !== "}"; next = this._peek()) {
					commandsNode.value += next;
				}

				current.value = new tags.VectorClip((scaleNode !== null) ? scaleNode.value : 1, commandsNode.value, false);
			}

			if (this.read(current, ")") === null) {
				parent.pop();
				return null;
			}

			return current;
		}

		parse_tag_k(parent: ParseNode): ParseNode {
			throw new Error("Method not implemented.");
		}

		parse_tag_K(parent: ParseNode): ParseNode {
			throw new Error("Method not implemented.");
		}

		parse_tag_kf(parent: ParseNode): ParseNode {
			throw new Error("Method not implemented.");
		}

		parse_tag_ko(parent: ParseNode): ParseNode {
			throw new Error("Method not implemented.");
		}

		parse_tag_move(parent: ParseNode): ParseNode {
			var current = new ParseNode(parent);

			if (this.read(current, "move") === null) {
				parent.pop();
				return null;
			}

			if (this.read(current, "(") === null) {
				parent.pop();
				return null;
			}

			var x1Node = this.parse_decimal(current);
			if (x1Node === null) {
				parent.pop();
				return null;
			}

			if (this.read(current, ",") === null) {
				parent.pop();
				return null;
			}

			var y1Node = this.parse_decimal(current);
			if (y1Node === null) {
				parent.pop();
				return null;
			}

			if (this.read(current, ",") === null) {
				parent.pop();
				return null;
			}

			var x2Node = this.parse_decimal(current);
			if (x2Node === null) {
				parent.pop();
				return null;
			}

			if (this.read(current, ",") === null) {
				parent.pop();
				return null;
			}

			var y2Node = this.parse_decimal(current);
			if (y2Node === null) {
				parent.pop();
				return null;
			}

			var t1Node: ParseNode = null;
			var t2Node: ParseNode = null;

			if (this.read(current, ",") !== null) {
				t1Node = this.parse_decimal(current);
				if (t1Node === null) {
					parent.pop();
					return null;
				}

				if (this.read(current, ",") === null) {
					parent.pop();
					return null;
				}

				t2Node = this.parse_decimal(current);
				if (t2Node === null) {
					parent.pop();
					return null;
				}
			}

			if (this.read(current, ")") === null) {
				parent.pop();
				return null;
			}

			current.value = new tags.Move(
				x1Node.value, y1Node.value, x2Node.value, y2Node.value,
				(t1Node !== null) ? (t1Node.value / 1000) : null, (t2Node !== null) ? (t2Node.value / 1000) : null
			);

			return current;
		}

		parse_tag_org(parent: ParseNode): ParseNode {
			var current = new ParseNode(parent);

			if (this.read(current, "org") === null) {
				parent.pop();
				return null;
			}

			if (this.read(current, "(") === null) {
				parent.pop();
				return null;
			}

			var xNode = this.parse_decimal(current);
			if (xNode === null) {
				parent.pop();
				return null;
			}

			if (this.read(current, ",") === null) {
				parent.pop();
				return null;
			}

			var yNode = this.parse_decimal(current);
			if (yNode === null) {
				parent.pop();
				return null;
			}

			if (this.read(current, ")") === null) {
				parent.pop();
				return null;
			}

			current.value = new tags.RotationOrigin(xNode.value, yNode.value);

			return current;
		}

		parse_tag_p(parent: ParseNode): ParseNode {
			throw new Error("Method not implemented.");
		}

		parse_tag_pbo(parent: ParseNode): ParseNode {
			throw new Error("Method not implemented.");
		}

		parse_tag_pos(parent: ParseNode): ParseNode {
			var current = new ParseNode(parent);

			if (this.read(current, "pos") === null) {
				parent.pop();
				return null;
			}

			if (this.read(current, "(") === null) {
				parent.pop();
				return null;
			}

			var xNode = this.parse_decimal(current);
			if (xNode === null) {
				parent.pop();
				return null;
			}

			if (this.read(current, ",") === null) {
				parent.pop();
				return null;
			}

			var yNode = this.parse_decimal(current);
			if (yNode === null) {
				parent.pop();
				return null;
			}

			if (this.read(current, ")") === null) {
				parent.pop();
				return null;
			}

			current.value = new tags.Position(xNode.value, yNode.value);

			return current;
		}

		parse_tag_q(parent: ParseNode): ParseNode {
			var current = new ParseNode(parent);

			if (this.read(current, "q") === null) {
				parent.pop();
				return null;
			}

			var next = this._peek();

			if (next < "0" || next > "3") {
				parent.pop();
				return null;
			}

			var valueNode = new ParseNode(current, next);

			current.value = new tags.WrappingStyle(parseInt(valueNode.value));

			return current;
		}

		parse_tag_r(parent: ParseNode): ParseNode {
			var current = new ParseNode(parent);

			if (this.read(current, "r") === null) {
				parent.pop();
				return null;
			}

			var valueNode = new ParseNode(current, "");

			for (var next = this._peek(); this._haveMore() && next !== "\\" && next !== "}"; next = this._peek()) {
				valueNode.value += next;
			}

			if (valueNode.value.length > 0) {
				current.value = new tags.Reset(valueNode.value);
			}
			else {
				current.value = new tags.Reset(null);
			}

			return current;
		}

		parse_tag_s(parent: ParseNode): ParseNode {
			throw new Error("Method not implemented.");
		}

		parse_tag_shad(parent: ParseNode): ParseNode {
			throw new Error("Method not implemented.");
		}

		parse_tag_t(parent: ParseNode): ParseNode {
			var current = new ParseNode(parent);

			if (this.read(current, "t") === null) {
				parent.pop();
				return null;
			}

			if (this.read(current, "(") === null) {
				parent.pop();
				return null;
			}

			var startNode: ParseNode = null;
			var endNode: ParseNode = null;
			var accelNode: ParseNode = null;

			var firstNode = this.parse_decimal(current);
			if (firstNode !== null) {
				if (this.read(current, ",") === null) {
					parent.pop();
					return null;
				}

				var secondNode = this.parse_decimal(current);
				if (secondNode !== null) {
					startNode = firstNode;
					endNode = secondNode;

					if (this.read(current, ",") === null) {
						parent.pop();
						return null;
					}

					var thirdNode = this.parse_decimal(current);
					if (thirdNode !== null) {
						accelNode = thirdNode;

						if (this.read(current, ",") === null) {
							parent.pop();
							return null;
						}
					}
				}
				else {
					accelNode = firstNode;

					if (this.read(current, ",") === null) {
						parent.pop();
						return null;
					}
				}
			}

			var transformTags: tags.Tag[] = [];

			for (var next = this._peek(); this._haveMore() && next !== ")" && next !== "}"; next = this._peek()) {
				var childNode: ParseNode = null;

				if (this.read(current, "\\") !== null) {
					childNode =
						this.parse_tag_alpha(current) ||
						this.parse_tag_iclip(current) ||
						this.parse_tag_xbord(current) ||
						this.parse_tag_ybord(current) ||
						this.parse_tag_xshad(current) ||
						this.parse_tag_yshad(current) ||

						this.parse_tag_blur(current) ||
						this.parse_tag_bord(current) ||
						this.parse_tag_clip(current) ||
						this.parse_tag_fscx(current) ||
						this.parse_tag_fscy(current) ||
						this.parse_tag_shad(current) ||

						this.parse_tag_fax(current) ||
						this.parse_tag_fay(current) ||
						this.parse_tag_frx(current) ||
						this.parse_tag_fry(current) ||
						this.parse_tag_frz(current) ||
						this.parse_tag_fsp(current) ||

						this.parse_tag_be(current) ||
						this.parse_tag_fr(current) ||
						this.parse_tag_fs(current) ||
						this.parse_tag_1a(current) ||
						this.parse_tag_1c(current) ||
						this.parse_tag_2a(current) ||
						this.parse_tag_2c(current) ||
						this.parse_tag_3a(current) ||
						this.parse_tag_3c(current) ||
						this.parse_tag_4a(current) ||
						this.parse_tag_4c(current) ||

						this.parse_tag_c(current);

					if (childNode === null) {
						current.pop(); // Unread backslash
					}
				}

				if (childNode === null) {
					childNode = this.parse_comment(current);
				}

				if (childNode !== null) {
					if (childNode.value instanceof tags.Comment && transformTags[transformTags.length - 1] instanceof tags.Comment) {
						// Merge consecutive comment parts into one part
						transformTags[transformTags.length - 1] =
							new tags.Comment(
								(<tags.Comment>transformTags[transformTags.length - 1]).value +
								(<tags.Comment>childNode.value).value
							);
					}
					else {
						transformTags.push(childNode.value);
					}
				}
				else {
					parent.pop();
					return null;
				}
			}

			if (this.read(current, ")") === null) {
				parent.pop();
				return null;
			}

			current.value =
				new tags.Transform(
					(startNode !== null) ? (startNode.value / 1000) : null,
					(endNode !== null) ? (endNode.value / 1000) : null,
					(accelNode !== null) ? (accelNode.value / 1000) : null,
					transformTags
				);

			return current;
		}

		parse_tag_u(parent: ParseNode): ParseNode {
			throw new Error("Method not implemented.");
		}

		parse_tag_xbord(parent: ParseNode): ParseNode {
			throw new Error("Method not implemented.");
		}

		parse_tag_xshad(parent: ParseNode): ParseNode {
			throw new Error("Method not implemented.");
		}

		parse_tag_ybord(parent: ParseNode): ParseNode {
			throw new Error("Method not implemented.");
		}

		parse_tag_yshad(parent: ParseNode): ParseNode {
			throw new Error("Method not implemented.");
		}

		parse_tag_1a(parent: ParseNode): ParseNode {
			throw new Error("Method not implemented.");
		}

		parse_tag_1c(parent: ParseNode): ParseNode {
			throw new Error("Method not implemented.");
		}

		parse_tag_2a(parent: ParseNode): ParseNode {
			throw new Error("Method not implemented.");
		}

		parse_tag_2c(parent: ParseNode): ParseNode {
			throw new Error("Method not implemented.");
		}

		parse_tag_3a(parent: ParseNode): ParseNode {
			throw new Error("Method not implemented.");
		}

		parse_tag_3c(parent: ParseNode): ParseNode {
			throw new Error("Method not implemented.");
		}

		parse_tag_4a(parent: ParseNode): ParseNode {
			throw new Error("Method not implemented.");
		}

		parse_tag_4c(parent: ParseNode): ParseNode {
			throw new Error("Method not implemented.");
		}

		parse_decimal(parent: ParseNode): ParseNode {
			var current = new ParseNode(parent);

			var negative = (this.read(current, "-") !== null);

			var numericalPart = this.parse_unsignedDecimal(current);

			if (numericalPart === null) {
				parent.pop();
				return null;
			}

			current.value = numericalPart.value;

			if (negative) {
				current.value = -current.value;
			}

			return current;
		}

		parse_unsignedDecimal(parent: ParseNode): ParseNode {
			var current = new ParseNode(parent);

			var characteristicNode = new ParseNode(current, "");

			var mantissaNode: ParseNode = null;

			var next: string;
			for (next = this._peek(); this._haveMore() && next >= "0" && next <= "9"; next = this._peek()) {
				characteristicNode.value += next;
			}

			if (characteristicNode.value.length === 0) {
				parent.pop();
				return null;
			}

			if (this.read(current, ".") !== null) {
				mantissaNode = new ParseNode(current, "");

				for (next = this._peek(); this._haveMore() && next >= "0" && next <= "9"; next = this._peek()) {
					mantissaNode.value += next;
				}

				if (mantissaNode.value.length === 0) {
					parent.pop();
					return null;
				}
			}

			current.value = parseFloat(characteristicNode.value + ((mantissaNode !== null) ? ("." + mantissaNode.value) : ""));

			return current;
		}

		parse_enableDisable(parent: ParseNode): ParseNode {
			var next = this._peek();

			if (next === "0" || next === "1") {
				var result = new ParseNode(parent, next);
				result.value = (result.value === "1");

				return result;
			}

			return null;
		}

		parse_hex(parent: ParseNode): ParseNode {
			var next = this._peek();

			if ((next >= "0" && next <= "9") || (next >= "a" && next <= "f") || (next >= "A" && next <= "F")) {
				return new ParseNode(parent, next);
			}

			return null;
		}

		parse_color(parent: ParseNode): ParseNode {
			var current = new ParseNode(parent);

			if (this.read(current, "&") === null) {
				parent.pop();
				return null;
			}

			this.read(current, "H");

			var digitNodes = Array<ParseNode>(6);

			for (var i = 0; i < digitNodes.length; i++) {
				var digitNode = this.parse_hex(current);
				if (digitNode === null) {
					parent.pop();
					return null;
				}
				digitNodes[i] = digitNode;
			}

			// Optional extra 00 at the end
			if (this.read(current, "0") !== null) {
				if (this.read(current, "0") === null) {
					parent.pop();
					return null;
				}
			}

			if (this.read(current, "&") === null) {
				parent.pop();
				return null;
			}

			current.value = new tags.Color(
				parseInt(digitNodes[4].value + digitNodes[5].value, 16),
				parseInt(digitNodes[2].value + digitNodes[3].value, 16),
				parseInt(digitNodes[0].value + digitNodes[1].value, 16)
			);

			return current;
		}

		parse_alpha(parent: ParseNode): ParseNode {
			var current = new ParseNode(parent);

			if (this.read(current, "&") === null) {
				parent.pop();
				return null;
			}

			this.read(current, "H");

			var firstDigitNode = this.parse_hex(current);
			if (firstDigitNode === null) {
				parent.pop();
				return null;
			}

			var secondDigitNode = this.parse_hex(current);

			this.read(current, "&");

			current.value = 1 - parseInt(firstDigitNode.value + ((secondDigitNode !== null) ? secondDigitNode : firstDigitNode).value, 16) / 255;

			return current;
		}

		parse_colorWithAlpha(parent: ParseNode): ParseNode {
			var current = new ParseNode(parent);

			if (this.read(current, "&H") === null) {
				parent.pop();
				return null;
			}

			var digitNodes = Array<ParseNode>(8);

			for (var i = 0; i < digitNodes.length; i++) {
				var digitNode = this.parse_hex(current);
				if (digitNode === null) {
					parent.pop();
					return null;
				}
				digitNodes[i] = digitNode;
			}

			current.value = new tags.Color(
				parseInt(digitNodes[6].value + digitNodes[7].value, 16),
				parseInt(digitNodes[4].value + digitNodes[5].value, 16),
				parseInt(digitNodes[2].value + digitNodes[3].value, 16),
				1 - parseInt(digitNodes[0].value + digitNodes[1].value, 16) / 255
			);

			return current;
		}

		private _peek(count: number = 1) {
			return this._input.substr(this._parseTree.end, count);
		}

		read(parent: ParseNode, next: string) {
			if (this._peek(next.length) !== next) {
				return null;
			}

			return new ParseNode(parent, next);
		}

		private _haveMore(): boolean {
			return this._parseTree.end < this._input.length;
		}
	};

	function makeTagParserFunction(
		tagName: string,
		tagConstructor: { new(value: any): tags.Tag },
		valueParser: (current: ParseNode) => ParseNode,
		required: boolean
	) {
		ParserRun.prototype["parse_tag_" + tagName] = function (parent: ParseNode): ParseNode {
			var self = <ParserRun>this;
			var current = new ParseNode(parent);

			if (self.read(current, tagName) === null) {
				parent.pop();
				return null;
			}

			var valueNode = valueParser.call(self, current);

			if (valueNode !== null) {
				current.value = new tagConstructor(valueNode.value);
			}
			else if (required) {
				current.value = new tagConstructor(null);
			}
			else {
				parent.pop();
				return null;
			}

			return current;
		}
	}

	makeTagParserFunction("alpha", tags.Alpha, ParserRun.prototype.parse_alpha, false);
	makeTagParserFunction("be", tags.Blur, ParserRun.prototype.parse_decimal, false);
	makeTagParserFunction("blur", tags.GaussianBlur, ParserRun.prototype.parse_decimal, false);
	makeTagParserFunction("bord", tags.Border, ParserRun.prototype.parse_decimal, false);
	makeTagParserFunction("c", tags.PrimaryColor, ParserRun.prototype.parse_color, false);
	makeTagParserFunction("fax", tags.SkewX, ParserRun.prototype.parse_decimal, false);
	makeTagParserFunction("fay", tags.SkewY, ParserRun.prototype.parse_decimal, false);
	makeTagParserFunction("fr", tags.RotateZ, ParserRun.prototype.parse_decimal, false);
	makeTagParserFunction("frx", tags.RotateX, ParserRun.prototype.parse_decimal, false);
	makeTagParserFunction("fry", tags.RotateY, ParserRun.prototype.parse_decimal, false);
	makeTagParserFunction("frz", tags.RotateZ, ParserRun.prototype.parse_decimal, false);
	makeTagParserFunction("fs", tags.FontSize, ParserRun.prototype.parse_decimal, false);
	makeTagParserFunction("fscx", tags.FontScaleX, ParserRun.prototype.parse_decimal, false);
	makeTagParserFunction("fscy", tags.FontScaleY, ParserRun.prototype.parse_decimal, false);
	makeTagParserFunction("fsp", tags.LetterSpacing, ParserRun.prototype.parse_decimal, false);
	makeTagParserFunction("i", tags.Italic, ParserRun.prototype.parse_enableDisable, false);
	makeTagParserFunction("k", tags.ColorKaraoke, ParserRun.prototype.parse_decimal, true);
	makeTagParserFunction("K", tags.SweepingColorKaraoke, ParserRun.prototype.parse_decimal, true);
	makeTagParserFunction("kf", tags.SweepingColorKaraoke, ParserRun.prototype.parse_decimal, true);
	makeTagParserFunction("ko", tags.OutlineKaraoke, ParserRun.prototype.parse_decimal, true);
	makeTagParserFunction("p", tags.DrawingMode, ParserRun.prototype.parse_decimal, true);
	makeTagParserFunction("pbo", tags.DrawingBaselineOffset, ParserRun.prototype.parse_decimal, true);
	makeTagParserFunction("s", tags.StrikeThrough, ParserRun.prototype.parse_enableDisable, false);
	makeTagParserFunction("shad", tags.Shadow, ParserRun.prototype.parse_decimal, false);
	makeTagParserFunction("u", tags.Underline, ParserRun.prototype.parse_enableDisable, false);
	makeTagParserFunction("xbord", tags.BorderX, ParserRun.prototype.parse_decimal, false);
	makeTagParserFunction("xshad", tags.ShadowX, ParserRun.prototype.parse_decimal, false);
	makeTagParserFunction("ybord", tags.BorderY, ParserRun.prototype.parse_decimal, false);
	makeTagParserFunction("yshad", tags.ShadowY, ParserRun.prototype.parse_decimal, false);
	makeTagParserFunction("1a", tags.PrimaryAlpha, ParserRun.prototype.parse_alpha, false);
	makeTagParserFunction("1c", tags.PrimaryColor, ParserRun.prototype.parse_color, false);
	makeTagParserFunction("2a", tags.SecondaryAlpha, ParserRun.prototype.parse_alpha, false);
	makeTagParserFunction("2c", tags.SecondaryColor, ParserRun.prototype.parse_color, false);
	makeTagParserFunction("3a", tags.OutlineAlpha, ParserRun.prototype.parse_alpha, false);
	makeTagParserFunction("3c", tags.OutlineColor, ParserRun.prototype.parse_color, false);
	makeTagParserFunction("4a", tags.ShadowAlpha, ParserRun.prototype.parse_alpha, false);
	makeTagParserFunction("4c", tags.ShadowColor, ParserRun.prototype.parse_color, false);

	var rules = new Map<string, (parent: ParseNode) => ParseNode>();
	Object.keys(ParserRun.prototype).forEach(key => {
		if (key.indexOf("parse_") === 0 && typeof ParserRun.prototype[key] === "function") {
			rules.set(key.substr("parse_".length), ParserRun.prototype[key]);
		}
	});

	class ParseNode {
		private _children: ParseNode[] = [];

		private _start: number;
		private _end: number;
		private _value: any;

		constructor(private _parent: ParseNode, value: string = null) {
			if (_parent !== null) {
				_parent._children.push(this);
			}

			this._start = ((_parent !== null) ? _parent.end : 0);

			if (value !== null) {
				this.value = value;
			}
			else {
				this._setEnd(this._start);
			}
		}

		get start(): number {
			return this._start;
		}

		get end(): number {
			return this._end;
		}

		get parent(): ParseNode {
			return this._parent;
		}

		get children(): ParseNode[] {
			return this._children;
		}

		get value(): any {
			return this._value;
		}

		set value(newValue: any) {
			this._value = newValue;

			if (this._value.constructor === String && this._children.length === 0) {
				this._setEnd(this._start + this._value.length);
			}
		}

		pop(): void {
			this._children.splice(this._children.length - 1, 1);

			if (this._children.length > 0) {
				this._setEnd(this._children[this._children.length - 1].end);
			}
			else {
				this._setEnd(this.start);
			}
		}

		private _setEnd(newEnd: number): void {
			this._end = newEnd;

			if (this._parent !== null && this._parent.end !== this._end) {
				this._parent._setEnd(this._end);
			}
		}
	}
}