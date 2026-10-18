import prompts from "prompts";

const dropNulls = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== null && v !== undefined));

export const promptImpl = (q) => (onCancel) => () => {
  const question = dropNulls({
    ...q,
    choices: q.choices === null ? null : q.choices.map((c) => dropNulls(c)),
  });
  const opts = onCancel === null ? undefined : { onCancel: () => onCancel() };
  return prompts(question, opts).then((answers) => {
    const v = answers[q.name];
    return v === undefined ? null : v;
  });
};
export const toForeign = (x) => x;
export const unsafeFromForeign = (x) => x;
