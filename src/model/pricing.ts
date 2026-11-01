import type { Recipe } from "../game/content";

/** Рецепты дорожают: лист редкого зелья ценится выше. */
export function recipePrice(recipe: Recipe): number {
  return Math.round((recipe.price * 1.8) / 5) * 5;
}
