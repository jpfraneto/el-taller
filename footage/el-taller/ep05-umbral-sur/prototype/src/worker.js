// Refugio Bruma (El Taller, Ep. 05): a static page. The Worker only serves public/.
export default {
  fetch(request, env) {
    return env.ASSETS.fetch(request);
  },
};
