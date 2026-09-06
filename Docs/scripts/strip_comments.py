"""Comment stripper. Writes <path>.stripped beside each input. Originals untouched."""

import ast
import io
import sys
import tokenize
from pathlib import Path


def docstring_spans(tree):
    # first Expr(Constant(str)) in a module/class/function body
    spans = []
    for node in ast.walk(tree):
        if not isinstance(node, (ast.Module, ast.ClassDef, ast.FunctionDef,
                                 ast.AsyncFunctionDef)):
            continue
        body = getattr(node, "body", [])
        if not body:
            continue
        first = body[0]
        if (isinstance(first, ast.Expr)
                and isinstance(first.value, ast.Constant)
                and isinstance(first.value.value, str)):
            spans.append((first.lineno, first.end_lineno))
    return spans


def strip_py(src):
    lines = src.splitlines(keepends=True)
    drop = set()
    truncate = {}

    for tok in tokenize.generate_tokens(io.StringIO(src).readline):
        if tok.type != tokenize.COMMENT:
            continue
        row, col = tok.start
        if lines[row - 1][:col].strip() == "":
            drop.add(row)
        else:
            truncate[row] = col

    for start, end in docstring_spans(ast.parse(src)):
        drop.update(range(start, end + 1))

    out = []
    for i, line in enumerate(lines, 1):
        if i in drop:
            continue
        if i in truncate:
            kept = line[:truncate[i]].rstrip()
            if kept:
                out.append(kept + "\n")
            continue
        out.append(line)
    return "".join(out)


def normalized_dump(src):
    # AST with docstrings removed, so stripped and original compare equal
    tree = ast.parse(src)
    for node in ast.walk(tree):
        if not isinstance(node, (ast.Module, ast.ClassDef, ast.FunctionDef,
                                 ast.AsyncFunctionDef)):
            continue
        body = getattr(node, "body", [])
        if (body and isinstance(body[0], ast.Expr)
                and isinstance(body[0].value, ast.Constant)
                and isinstance(body[0].value.value, str)):
            del body[0]
            if not body:
                body.append(ast.Pass())
    return ast.dump(tree)


def run(paths):
    rows = []
    for p in paths:
        path = Path(p)
        src = path.read_text()
        try:
            new = strip_py(src)
            gate = normalized_dump(src) == normalized_dump(new)
        except SyntaxError as e:
            rows.append((str(path), 0, 0, 0, f"PARSE FAIL {e.lineno}"))
            continue
        Path(str(path) + ".stripped").write_text(new)
        before = src.count("\n")
        after = new.count("\n")
        rows.append((str(path), before, after, before - after,
                     "PASS" if gate else "FAIL"))

    print(f"{'file':<28}{'before':>8}{'after':>8}{'cut':>7}{'  ast'}")
    for name, b, a, c, g in rows:
        print(f"{name:<28}{b:>8}{a:>8}{c:>7}  {g}")
    tb = sum(r[1] for r in rows)
    ta = sum(r[2] for r in rows)
    print(f"{'TOTAL':<28}{tb:>8}{ta:>8}{tb - ta:>7}")


if __name__ == "__main__":
    run(sys.argv[1:])
