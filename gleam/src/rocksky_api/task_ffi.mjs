export const jitter = (ms) => Math.round(ms * (0.5 + Math.random()));

export const timeout = (task, ms, expired) => new Promise((resolve, reject) => {
  const timer = setTimeout(() => resolve(expired), ms);
  task.then(value => { clearTimeout(timer); resolve(value); }, error => { clearTimeout(timer); reject(error); });
});
