function info(message, data = {}) {
  console.log(JSON.stringify({
    level: 'info',
    message,
    timestamp: new Date().toISOString(),
    ...data,
  }));
}

function error(message, data = {}) {
  console.error(JSON.stringify({
    level: 'error',
    message,
    timestamp: new Date().toISOString(),
    ...data,
  }));
}

function warn(message, data = {}) {
  console.warn(JSON.stringify({
    level: 'warn',
    message,
    timestamp: new Date().toISOString(),
    ...data,
  }));
}

module.exports = { info, error, warn };
