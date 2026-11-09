const form = document.querySelector('#submit-file');
const message = document.querySelector('#message');
const submit = document.querySelector('#submit');
const stages = ['creating', 'uploading', 'ingesting', 'quota'];
const stageNames = ['object-create', 's3-upload', 'ingest', 'quota'];

function element(tag, text, className) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
}

async function request(path, body) {
  const response = await fetch(path, body ? {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  } : {});
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Request failed.');
  return data;
}

async function refresh() {
  try {
    const data = await request('/api/runs');
    document.querySelector('#connection').textContent = '';
    document.querySelector('#pages-used').textContent = data.org.pagesUsed;
    const list = document.querySelector('#runs');
    // Keep keyboard focus on the retry button while a user interacts with it.
    if (list.contains(document.activeElement)) return;
    const rows = data.runs.map(run => {
      const row = element('article', undefined, 'run');
      const heading = element('div', undefined, 'run-header');
      heading.append(element('h3', run.fileName), element('span', run.status, `badge ${run.status}`));
      row.append(heading, element('small', `chain ${run.jobChainId}`));
      const steps = element('div', undefined, 'steps');
      const current = stages.indexOf(run.status);
      stageNames.forEach((name, index) => {
        const state = run.status === 'done' || index < current ? 'complete' : index === current ? 'current' : '';
        steps.append(element('span', `${index + 1} ${name}`, `step ${state}`));
      });
      row.append(steps);
      if (run.error) row.append(element('p', run.error, 'error'));
      if (run.status === 'failed') {
        const retry = element('button', 'Clear simulated failure & retry', 'retry');
        retry.type = 'button';
        retry.addEventListener('click', async () => {
          retry.disabled = true;
          try {
            await request(`/api/runs/${encodeURIComponent(run.jobChainId)}/retry`, {});
            message.textContent = 'Failure cleared. The same chain is queued again.';
            retry.blur();
            await refresh();
          } catch (error) { message.textContent = error.message; }
          finally { retry.disabled = false; }
        });
        row.append(retry);
      }
      if (run.s3Key) row.append(element('small', `mock storage: ${run.s3Key}`));
      return row;
    });
    list.replaceChildren(...(rows.length ? rows : [element('p', 'No runs yet. Send your first simulated document above.', 'empty')]));
  } catch (error) {
    document.querySelector('#connection').textContent = error.message;
  }
}

form.addEventListener('submit', async event => {
  event.preventDefault();
  submit.disabled = true;
  try {
    const data = await request('/api/drive/webhook', {
      fileName: document.querySelector('#file-name').value,
      pages: Number(document.querySelector('#pages').value),
      simulateFailure: document.querySelector('#failure').checked,
    });
    message.textContent = `Accepted (${data.jobChainId}). The request is done; workers own the rest.`;
    await refresh();
  } catch (error) { message.textContent = error.message; }
  finally { submit.disabled = false; }
});

async function poll() {
  await refresh();
  setTimeout(poll, 1000);
}
void poll();
