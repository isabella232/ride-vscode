import {
    IBlock,
    IConstByteStr,
    IConstLong,
    IConstStr,
    IDApp,
    IFalse,
    IFunc,
    IFunctionCall,
    IGetter,
    IIf,
    ILet,
    IMatch,
    IMatchCase,
    IPos,
    IRef,
    IScript,
    ITrue,
    TArgument,
    TFunction,
    TList,
    TNode,
    TStruct,
    TStructField,
    TUnion
} from "@waves/ride-js";
import suggestions, { isList, isPrimitive, isStruct, isUnion } from "./suggestions";

export const isIConstByteStr = (node: TNode | null): node is IConstByteStr => node != null && node.type === "CONST_BYTESTR";
export const isIConstLong = (node: TNode | null): node is IConstLong => node != null && node.type === "CONST_LONG";
export const isIConstStr = (node: TNode | null): node is IConstStr => node != null && node.type === "CONST_STRING";
export const isITrue = (node: TNode | null): node is ITrue => node != null && node.type === "TRUE";
export const isIFalse = (node: TNode | null): node is IFalse => node != null && node.type === "FALSE";
export const isIRef = (node: TNode | null): node is IRef => node != null && node.type === "REF";
export const isIBlock = (node: TNode | null): node is IBlock => node != null && node.type === "BLOCK";
export const isILet = (node: TNode | null): node is ILet => node != null && node.type === "LET";
export const isIIf = (node: TNode | null): node is IIf => node != null && node.type === "IF";
export const isIFunctionCall = (node: TNode | null): node is IFunctionCall => node != null && node.type === "FUNCTION_CALL";
export const isIGetter = (node: TNode | null): node is IGetter => node != null && node.type === "GETTER";
export const isIMatch = (node: TNode | null): node is IMatch => node != null && node.type === "MATCH";
export const isIMatchCase = (node: TNode | null): node is IMatchCase => node != null && node.type === "MATCH_CASE";
export const isIFunc = (node: TNode | null): node is IFunc => node != null && node.type === "FUNC";
export const isIScript = (node: TNode | null): node is IScript => node != null && node.type === "SCRIPT";
export const isIDApp = (node: TNode | null): node is IDApp => node != null && node.type === "DAPP";

const findNodeByFunc = (node: TNode, f: (node: TNode) => TNode | null): TNode | null => {
    if (isIBlock(node)) {
        return f(node.body) || f(node.dec)
    } else if (isILet(node) || isIMatch(node) || isIMatchCase(node) || isIFunc(node) || isIScript(node) || isIDApp(node)) {
        return f(node.expr)
    } else if (isIIf(node)) {
        return f(node.cond) || f(node.ifTrue) || f(node.ifFalse)
    } else if (isIFunctionCall(node)) {
        return node.args.find(node => f(node) != null) || null
    } else if (isIGetter(node)) {
        return f(node.ref)
    } else if (isIMatch(node)) {
        return node.cases.find(node => f(node) != null) || null
    } else {
        return null
    }
};

export function getNodeByOffset(node: TNode, pos: number): TNode {

    const validateNodeByPos = (pos: number) => (node: TNode): TNode | null =>
        (node.posStart <= pos && node.posEnd >= pos) ? node : null;

    const goodChild = findNodeByFunc(node, validateNodeByPos(pos));
    return (goodChild) ? getNodeByOffset(goodChild, pos) : node
}

export function getFunctionDefinition(exprAst: TNode, node: IFunctionCall): IFunc | null {
    const defPos = node.ctx.find(({name}) => name === node.name.value);
    if (defPos) {
        const def = getNodeByOffset(exprAst, defPos.posStart);
        if (isIFunc(def)) return def;
    }
    return null
}

export function offsetToRange(startOffset: number, content: string): { line: number, character: number } {
    const sliced = content.slice(0, startOffset).split('\n');
    const line = sliced.length - 1, character = sliced[line].length === 0 ? 0 : sliced[line].length - 1;
    return {line, character};
}

export function rangeToOffset(line: number, character: number, content: string): number {
    const split = content.split('\n');
    return Array.from({length: line}, (_, i) => i)
        .reduce((acc, i) => acc + split[i].length + 1, 0) + character + 1;
}

export const getFuncArgumentOrTypeByPos = (node: IFunc, pos: number): string | null => {
    let out: string | null = null;
    node.argList.forEach((arg) => {
        if (validateByPos(pos, arg.argName)) {
            out = getFuncArgNameHover(arg);
        } else {
            for (const {typeName} of arg.typeList) {
                if (validateByPos(pos, typeName)) {
                    const type = suggestions.types.find(({name}) => name === typeName.value);
                    out = type ? getTypeDoc(type) : typeName.value;
                    break;
                }
            }
        }
    })
    return out
}

export const validateByPos = (pos: number, node: IPos) => (node.posStart <= pos && node.posEnd >= pos);

export const getFuncHoverByNode = (n: IFunc) => `${n.name.value}(${n.argList.map(({argName: {value}, typeList}) =>
    `${value}: ${typeList.map(({typeName: {value}}) => value).join('|')}`).join(', ')}): ${n.expr.resultType}`;
export const getFuncHoverByTFunction = (f: TFunction) => `${f.name}(${f.args.map(({name, type}) =>
    `${name}: ${type}`).join(', ')}): ${f.resultType}`;
export const getFuncArgNameHover = ({argName: {value: name}, typeList}: TArgument) => `${name}: ${
    typeList.map(({typeName: {value: name}}) => `${name}`).join(' | ')}`;

export const getTypeDoc = (item: TStructField, isRec?: Boolean): string => {
    const type = item.type;
    let typeDoc = 'Unknown';
    switch (true) {
        case isPrimitive(type):
            typeDoc = type as string;
            break;
        case isStruct(type):
            typeDoc = isRec ? (type as TStruct).typeName :
                `**${(type as TStruct).typeName}**(\n- ` + (type as TStruct).fields
                    .map((v) => `${v.name}: ${getTypeDoc(v, true)}`).join('\n- ') + '\n\n)';
            break;
        case isUnion(type):
            typeDoc = (type as TUnion).map(field => isStruct(field) ? field.typeName : field).join('|');
            break;
        case isList(type):
            typeDoc = `LIST[ ` +
                `${((type as TList).listOf as TStruct).typeName || (type as TList).listOf}]`;
            break;
    }
    return typeDoc;
};

// const getNodeChildren = (node: TNode): TNode[] => {
//     if (isIBlock(node)) {
//         return [node.dec, node.body]
//     } else if (isILet(node) || isIMatch(node) || isIMatchCase(node) || isIFunc(node) || isIScript(node) || isIDApp(node)) {
//         return [node.expr]
//     } else if (isIIf(node)) {
//         return [node.cond, node.ifTrue, node.ifFalse]
//     } else if (isIFunctionCall(node)) {
//         return node.args
//     } else if (isIGetter(node)) {
//         return [node.ref]
//     } else if (isIMatch(node)) {
//         return node.cases
//     } else {
//         return []
//     }
// };
//
// export function getNodeDefinitionByName(node: TNode, name: string, refPos: number): TNode | null {
//     const out: TNode[] = [];
//
//     const validateNodeByName = (n: TNode): boolean => ((isIFunc(n) || isILet(n)) && n.name.value === name);
//
//     function go(n: TNode) {
//         const children = getNodeChildren(n);
//         children.forEach(child => {
//             validateNodeByName(child) && out.push(child);
//             go(child)
//         })
//     }
//
//     go(node);
//     return out
//         .map(node => ({distance: refPos - node.posStart, node}))
//         .filter(({distance}) => distance > 0)
//         .map(({node}) => node)
//         .pop() || null
//
// }
