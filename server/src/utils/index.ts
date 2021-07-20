import {
    getExpressionType,
    getFuncArgumentOrTypeByPos,
    getFuncHoverByNode,
    getFuncHoverByTFunction,
    getTypeDoc,
    validateByPos
} from './hoverUtils';
import {
    convertToCompletion,
    getCompletionDefaultResult,
    getNodeType,
    getPostfixFunctions,
    intersection
} from './completionUtils';
import {getFunctionDefinition} from './definitionUtils';
import {
    IAnnotatedFunc,
    IAnnotation,
    IBlock,
    ICompilationError,
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
    IParseAndCompileResult,
    IRef,
    IScript,
    ITrue,
    TDecl,
    TExpr,
    TNode,
    TPrimitiveNode
} from '@waves/ride-js';


export {
    getNodeType,
    getFunctionDefinition,

    getPostfixFunctions,
    getCompletionDefaultResult,
    convertToCompletion,
    intersection,

    getFuncArgumentOrTypeByPos,
    validateByPos,
    getFuncHoverByNode,
    getFuncHoverByTFunction,
    getTypeDoc,
    getExpressionType,
};


export const isIConstByteStr = (node: TNode | null): node is IConstByteStr => node != null && node.type === 'CONST_BYTESTR';
export const isIConstLong = (node: TNode | null): node is IConstLong => node != null && node.type === 'CONST_LONG';
export const isIConstStr = (node: TNode | null): node is IConstStr => node != null && node.type === 'CONST_STRING';
export const isITrue = (node: TNode | null): node is ITrue => node != null && node.type === 'TRUE';
export const isIFalse = (node: TNode | null): node is IFalse => node != null && node.type === 'FALSE';
export const isIRef = (node: TNode | null): node is IRef => node != null && node.type === 'REF';
export const isIBlock = (node: TNode | null): node is IBlock => node != null && node.type === 'BLOCK';
export const isILet = (node: TNode | null): node is ILet => node != null && node.type === 'LET';
export const isIIf = (node: TNode | null): node is IIf => node != null && node.type === 'IF';
export const isIFunctionCall = (node: TNode | null): node is IFunctionCall => node != null && node.type === 'FUNCTION_CALL';
export const isIGetter = (node: TNode | null): node is IGetter => node != null && node.type === 'GETTER';
export const isIMatch = (node: TNode | null): node is IMatch => node != null && node.type === 'MATCH';
export const isIFunc = (node: TNode | null): node is IFunc => node != null && node.type === 'FUNC';
export const isIScript = (node: TNode | null): node is IScript => node != null && node.type === 'SCRIPT';
export const isIDApp = (node: TNode | null): node is IDApp => node != null && node.type === 'DAPP';
export const isIAnnotatedFunc = (node: TNode | null): node is IAnnotatedFunc => node != null && node.type === 'ANNOTATEDFUNC';
export const isIAnnotation = (node: TNode | null): node is IAnnotation => node != null && node.type === 'ANNOTATION';
export const isParseError = (res: IParseAndCompileResult | ICompilationError): res is ICompilationError => 'error' in res;
export const isPrimitiveNode = (node: TNode): node is TPrimitiveNode => isIConstStr(node) || isIConstByteStr(node) || isIConstLong(node) || isITrue(node) || isIFalse(node)

const findNodeByFunc = (node: TNode, f: (node: TNode) => TNode | null): TNode | null => {
    if (isIBlock(node)) {
        return node.dec.name.value.startsWith('$match')
            ? (f((node.body as IIf).ifTrue) || f((node.body as IIf).ifFalse))
            : (f(node.body) || f(node.dec));
    } else if (isIDApp(node)) {
        return node.decList.find(node => f(node) != null) || node.annFuncList.find(node => f(node) != null) || null;
    } else if (isILet(node)) {
        return f(node.expr)
    } else if (isIFunc(node) || isIScript(node)) {
        return f(node.expr)
    } else if (isIIf(node)) {
        return f(node.ifTrue) || f(node.ifFalse) || f(node.cond);
    } else if (isIFunctionCall(node)) {
        return node.args.find(node => f(node) != null) || null;
    } else if (isIGetter(node)) {
        return f(node.ref);
    } else {
        return null;
    }
};

const findNodeByDApp = (node: IDApp, position: number) => {
    const validateNodeByPos = (node: TNode, pos: number) =>
        (node.posStart <= pos && node.posEnd >= pos) ? node : null;

    const annotatedFunc = findAnnotatedFunc(node.annFuncList, position)
    console.log('annotatedFunc', JSON.stringify(annotatedFunc))
    const constants = !!annotatedFunc ? getConstantsFromFunction(annotatedFunc.func) : []
    console.log('constants', constants)
    const constant = getSelectedConst(constants, position)
    console.log('constant', constant)

    return node.decList.find(node => validateNodeByPos(node, position) != null) || constant || validateNodeByPos(annotatedFunc.func, position)
}

// @ts-ignore
export function offsetToRange(startOffset: number, content: string): { line: number, character: number } {
    try {
        const sliced = content.slice(0, startOffset).split('\n');
        const line = sliced.length - 1, character = sliced[line].length === 0 ? 0 : sliced[line].length - 1;
        return {line, character};
    } catch (e) {
        console.error('offsetToRange', e)
    }
}

export function rangeToOffset(line: number, character: number, content: string): number {
    const split = content.split('\n');
    const position = Array.from({length: line}, (_, i) => i)
        .reduce((acc, i) => acc + split[i].length + 1, 0) + character
    return line !== 0 ? position + 1 : position
}


// @ts-ignore
export function getNodeByOffset(node: TNode, pos: number): TNode {
    console.log(node.type)
    const validateNodeByPos = (node: TNode, pos: number) => (node: TNode): TNode | null => {
        console.log(node)
        return (!!node && !!node.posStart && !!node.posEnd && (node.posStart <= pos && node.posEnd >= pos)) ? node : null;
    }

    if (!isIDApp(node)) {
        const goodChild = findNodeByFunc(node, validateNodeByPos(node, pos));
        // @ts-ignore
        console.log('getNodeByOffset(goodChild, pos)', getNodeByOffset(goodChild, pos))

        return (goodChild) ? getNodeByOffset(goodChild, pos) : node;
    } else {
        try {
            const goodChild = findNodeByDApp(node, pos)
            console.log(goodChild)
            return (goodChild) ? getNodeByOffset(goodChild, pos) : node;
        } catch (e) {
            console.error('dapp', e)
        }
    }
}

export function findAnnotatedFunc(funcList: any[], pos: number): any {
    return Array.isArray(funcList) ? funcList.find(i => (i.posStart <= pos) && (i.posEnd >= pos)) : null
}

export function getConstantsFromFunction(funcNode: IFunc): TDecl[] {
    const result = [] as TDecl[]
    const recursiveFunc = (node: TExpr) => {
        if (isIBlock(node)) {
            result.push(node.dec)
            recursiveFunc(node.body)
        }
    }
    recursiveFunc(funcNode.expr)
    return result
}

export function getSelectedConst(constants: TDecl[], position: number): TDecl | undefined {
    const validateNodeByPos = (node: TDecl, pos: number): boolean => !!node && !!node.posStart && pos >= node.posStart && pos <= node.posEnd
    return constants.find(node => {
        return validateNodeByPos(node, position)
    })
}
