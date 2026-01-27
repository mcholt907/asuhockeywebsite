// Manual mock for axios to avoid ES module issues in Jest
const axios = {
  get: jest.fn(() => Promise.resolve({ data: {} })),
  post: jest.fn(() => Promise.resolve({ data: {} })),
  put: jest.fn(() => Promise.resolve({ data: {} })),
  delete: jest.fn(() => Promise.resolve({ data: {} })),
  create: jest.fn(() => axios),
  defaults: {
    headers: {
      common: {},
    },
  },
};

export default axios;

