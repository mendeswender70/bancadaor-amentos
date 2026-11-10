// O pdf.js 6 usa Promise.withResolvers, que o Safari só tem a partir do 17.4.
if (typeof Promise.withResolvers !== 'function') {
  Promise.withResolvers = function withResolvers() {
    let resolve;
    let reject;
    const promise = new this((a, b) => {
      resolve = a;
      reject = b;
    });
    return { promise, resolve, reject };
  };
}
