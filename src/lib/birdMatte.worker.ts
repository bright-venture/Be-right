// Runs refineBirdMatte off the main thread (see src/lib/matte.ts).
import { refineBirdMatte } from "./birdMatte";

type Job = { id: number; image: ImageData };
const scope = self as unknown as {
  onmessage: ((event: MessageEvent<Job>) => void) | null;
  postMessage(message: Job, transfer: Transferable[]): void;
};

scope.onmessage = ({ data: { id, image } }) => {
  const result = refineBirdMatte(image);
  scope.postMessage({ id, image: result }, [result.data.buffer]);
};
