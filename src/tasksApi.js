const API_URL = "https://testapi.io/api/arvydasmockus-arch/resource/tasklist";

async function request(url, options = {}) {
  const response = await fetch(url, options);

  if (!response.ok) {
    throw new Error(`API klaida (${response.status}). Bandykite dar kartą.`);
  }

  return response.json();
}

function normalizeTask(task) {
  if (!task || task.id == null) {
    throw new Error("API grąžino netinkamus užduoties duomenis.");
  }

  return {
    id: task.id,
    title: task.title ?? "",
    status: task.status || "Nepradėta",
    deadline: task.deadline?.slice(0, 10) || "",
  };
}

export async function getTasks(signal) {
  const tasks = [];
  let page = 1;
  let hasNextPage;

  do {
    const result = await request(`${API_URL}?page=${page}`, { signal });
    if (!Array.isArray(result.data)) {
      throw new Error("API grąžino netinkamą užduočių sąrašą.");
    }
    tasks.push(...result.data.map(normalizeTask));
    hasNextPage = Boolean(result.next_page_url);
    page += 1;
  } while (hasNextPage);

  return tasks;
}

export async function saveTask(task, method = "POST") {
  const url = method === "PUT"
    ? `${API_URL}/${encodeURIComponent(task.id)}`
    : API_URL;
  const result = await request(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      title: task.title,
      status: task.status,
      deadline: task.deadline,
    }),
  });

  return normalizeTask(result.data ?? result);
}
