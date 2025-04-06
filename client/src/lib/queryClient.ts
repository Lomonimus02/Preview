import { QueryClient, QueryFunction } from "@tanstack/react-query";

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
  }
}

export async function apiRequest(
  methodOrUrl: string,
  urlOrData?: string | unknown,
  data?: unknown | undefined,
): Promise<Response> {
  // Определяем метод и URL в зависимости от количества и типа аргументов
  let method: string;
  let url: string;
  let requestData: unknown | undefined;

  if (arguments.length === 1) {
    // Если передан только URL, используем GET
    method = 'GET';
    url = methodOrUrl;
    requestData = undefined;
  } else if (arguments.length === 2) {
    // Если переданы два аргумента, проверяем тип второго
    if (typeof urlOrData === 'string') {
      // Если второй аргумент строка, значит первый - это метод, а второй - URL
      method = methodOrUrl;
      url = urlOrData as string;
      requestData = undefined;
    } else {
      // Если второй аргумент не строка, значит первый - это URL, а второй - данные для метода POST
      method = 'POST';
      url = methodOrUrl;
      requestData = urlOrData;
    }
  } else {
    // Если переданы все три аргумента, используем их как есть
    method = methodOrUrl;
    url = urlOrData as string;
    requestData = data;
  }

  const res = await fetch(url, {
    method,
    headers: requestData ? { "Content-Type": "application/json" } : {},
    body: requestData ? JSON.stringify(requestData) : undefined,
    credentials: "include",
  });

  await throwIfResNotOk(res);
  return res;
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const res = await fetch(queryKey[0] as string, {
      credentials: "include",
    });

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }

    await throwIfResNotOk(res);
    return await res.json();
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});
