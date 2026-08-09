import { useState } from "react";
import { Search, Store, Trash2 } from "lucide-react";
import type { DriverRestaurantAssignment } from "../../shared/api/driversApi";
import {
  getCourierBillingRule,
  restaurantCourierTypeLabels,
  type RestaurantCourierType,
} from "../restaurant-billing/restaurantBillingRules";

type RestaurantOption = { id: string; name: string };

const normalizeSearch = (value: string) =>
  value.trim().toLocaleLowerCase("ru-RU");

export function DriverRestaurantAssignmentsEditor({
  restaurants,
  assignments,
  onChange,
  isLoading = false,
}: {
  restaurants: RestaurantOption[];
  assignments: DriverRestaurantAssignment[];
  onChange: (assignments: DriverRestaurantAssignment[]) => void;
  isLoading?: boolean;
}) {
  const [query, setQuery] = useState("");
  const normalizedQuery = normalizeSearch(query);
  const assignedIds = new Set(
    assignments.map((assignment) => assignment.restaurantId),
  );
  const searchResults = normalizedQuery
    ? restaurants
        .filter(
          (restaurant) =>
            !assignedIds.has(restaurant.id) &&
            normalizeSearch(restaurant.name).includes(normalizedQuery),
        )
        .slice(0, 8)
    : [];

  const updateAssignment = (
    restaurantId: string,
    patch: Partial<
      Pick<DriverRestaurantAssignment, "courierType" | "isPrimary">
    >,
  ) => {
    onChange(
      assignments.map((assignment) =>
        assignment.restaurantId === restaurantId
          ? { ...assignment, ...patch }
          : assignment,
      ),
    );
  };

  const connect = (restaurant: RestaurantOption) => {
    onChange([
      ...assignments,
      {
        restaurantId: restaurant.id,
        restaurantName: restaurant.name,
        isPrimary: false,
        priority: assignments.length + 10,
        courierType: null,
      },
    ]);
    setQuery("");
  };

  return (
    <fieldset
      className="driver-restaurant-bindings"
      aria-label="Привязка к ресторанам"
    >
      <legend>Рестораны и условия работы</legend>
      <label className="driver-restaurant-bindings__search">
        <Search aria-hidden="true" />
        <input
          type="search"
          aria-label="Найти ресторан"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Найти ресторан"
          autoComplete="off"
        />
      </label>
      <small>
        Добавляйте только нужные рестораны. Изменения сразу видны ресторану.
      </small>

      {isLoading && (
        <span className="driver-restaurant-bindings__empty">
          Загружаем рестораны…
        </span>
      )}
      {!isLoading && assignments.length === 0 && (
        <span className="driver-restaurant-bindings__empty">
          Водитель пока не подключён ни к одному ресторану.
        </span>
      )}

      <div className="driver-restaurant-bindings__assigned">
        {assignments.map((assignment) => (
          <article key={assignment.restaurantId}>
            <header>
              <span className="driver-restaurant-bindings__icon">
                <Store aria-hidden="true" />
              </span>
              <span>
                <strong>{assignment.restaurantName}</strong>
                <small>
                  <i />
                  Подключён
                </small>
              </span>
              <button
                type="button"
                className="driver-restaurant-bindings__remove"
                onClick={() =>
                  onChange(
                    assignments.filter(
                      (item) => item.restaurantId !== assignment.restaurantId,
                    ),
                  )
                }
                aria-label={`Удалить привязку к ${assignment.restaurantName}`}
              >
                <Trash2 aria-hidden="true" />
              </button>
            </header>

            <div className="driver-restaurant-bindings__conditions">
              <strong>Условия работы</strong>
              {(
                Object.entries(restaurantCourierTypeLabels) as Array<
                  [RestaurantCourierType, string]
                >
              ).map(([value, label]) => (
                <label key={value}>
                  <input
                    type="radio"
                    name={`courier-type-${assignment.restaurantId}`}
                    checked={assignment.courierType === value}
                    onChange={() =>
                      updateAssignment(assignment.restaurantId, {
                        courierType: value,
                      })
                    }
                    aria-label={`${label} — ${assignment.restaurantName}`}
                  />
                  <span>{label}</span>
                </label>
              ))}
              {!assignment.courierType && (
                <small className="driver-restaurant-bindings__warning">
                  Выберите условия работы перед сохранением.
                </small>
              )}
              {assignment.courierType && (
                <small className="driver-restaurant-bindings__billing-rule">
                  {
                    getCourierBillingRule({
                      courierType: assignment.courierType,
                      freeDeliveryThresholdReached: false,
                    }).payerLabel
                  }
                </small>
              )}
              <label className="driver-restaurant-bindings__primary">
                <span>
                  <strong>Основной курьер</strong>
                  <small>Получает заказ первым</small>
                </span>
                <input
                  type="checkbox"
                  checked={assignment.isPrimary}
                  onChange={(event) =>
                    updateAssignment(assignment.restaurantId, {
                      isPrimary: event.target.checked,
                    })
                  }
                  aria-label={`Основной курьер — ${assignment.restaurantName}`}
                />
              </label>
            </div>
          </article>
        ))}
      </div>

      {normalizedQuery && (
        <section
          className="driver-restaurant-bindings__results"
          aria-label="Результаты поиска ресторанов"
        >
          <strong>Результаты поиска</strong>
          {searchResults.map((restaurant) => (
            <article key={restaurant.id}>
              <span className="driver-restaurant-bindings__icon">
                <Store aria-hidden="true" />
              </span>
              <span>
                <strong>{restaurant.name}</strong>
                <small>Ресторан не подключён</small>
              </span>
              <button
                type="button"
                onClick={() => connect(restaurant)}
                aria-label={`Подключить ${restaurant.name}`}
              >
                Подключить
              </button>
            </article>
          ))}
          {searchResults.length === 0 && (
            <small>Подходящих неподключённых ресторанов нет.</small>
          )}
        </section>
      )}
    </fieldset>
  );
}
