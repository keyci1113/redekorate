/** An uploaded photo, optionally with where it sits in the circle (`#c=x,y,zoom`, written by the web app's avatar editor). */
export const AVATAR_RE = /^\/uploads\/[a-z0-9]+\.(png|jpg|gif|webp)(#c=\d(\.\d{1,3})?,\d(\.\d{1,3})?,\d(\.\d{1,2})?)?$/;
