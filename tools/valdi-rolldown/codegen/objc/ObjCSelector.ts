// ViewModels/ObjCSelector.swift: an Objective-C method from its name and parameters, the first one's name joined to
// the method's (`- (void)showWithRequest:(…)request done:(…)done`).
import { CompilerError, pascalCased } from '../Utils';

export interface ObjcMessageParameter {
  name: string;
  type: string;
}

export class ObjCSelector {
  readonly messageParts: string[];
  readonly messageDeclaration: string;
  /** `showWithRequest:done:`. */
  readonly selectorName: string;

  constructor(
    readonly returnType: string,
    methodName: string,
    readonly parameters: ObjcMessageParameter[],
  ) {
    if (!parameters.length) {
      this.messageParts = [methodName];
      this.messageDeclaration = `- (${returnType})${methodName}`;
      this.selectorName = methodName;
      return;
    }
    const messageParts: string[] = [];
    let messageDeclaration = `- (${returnType})`;
    parameters.forEach((parameter, index) => {
      let messagePart: string;
      if (index === 0) {
        messagePart = `${methodName}With${pascalCased(parameter.name)}`;
      } else {
        messagePart = parameter.name;
        messageDeclaration += ' ';
      }
      messageDeclaration += messagePart;
      messageDeclaration += `:(${parameter.type})${parameter.name}`;
      messageParts.push(messagePart);
    });
    this.messageParts = messageParts;
    this.messageDeclaration = messageDeclaration;
    this.selectorName = messageParts.map(part => `${part}:`).join('');
  }

  makeCallString(parameterValues: string[]): string {
    if (parameterValues.length !== this.parameters.length) {
      throw new CompilerError(
        `Invalid number of parameters, expected ${this.parameters.length}, got ${parameterValues.length}`,
      );
    }
    if (!this.parameters.length) return this.messageParts[0];
    return this.messageParts.map((part, index) => `${part}:${parameterValues[index]}`).join(' ');
  }
}
