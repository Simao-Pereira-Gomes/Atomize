/**
 * Measures the average execution time of a synchronous function over N iterations.
 * Includes a warm-up phase to mitigate JIT "cold start" penalties.
 */
export const measurePerformance = (
  fn: () => void,
  iterations = 100,
): number => {
  // Warm-up phase
  for (let i = 0; i < 5; i++) {
    fn();
  }

  // Measurement phase
  const start = performance.now();
  for (let i = 0; i < iterations; i++) {
    fn();
  }
  const end = performance.now();

  return (end - start) / iterations;
};
