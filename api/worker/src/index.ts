import { Container, getContainer } from "@cloudflare/containers";

export class ApiContainer extends Container {
  defaultPort = 8080;
  sleepAfter = "10m";
}

interface Env {
  API_CONTAINER: DurableObjectNamespace<ApiContainer>;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    // The API is stateless, so one shared container instance serves every request.
    return getContainer(env.API_CONTAINER).fetch(request);
  },
};
