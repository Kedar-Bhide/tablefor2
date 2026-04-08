export function getPhotos(meal) {
  if (meal?.photos?.length > 0) return meal.photos;
  if (meal?.photoURL) return [meal.photoURL];
  return [];
}