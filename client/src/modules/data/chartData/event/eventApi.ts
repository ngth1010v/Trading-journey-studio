import { request } from "../../../shared/apiClient";
import type { Event } from "./EventData";

const API_BASE = "/api/chartData/events";

/**
 * Fetches all events from the server.
 */
export async function fetchEvents(): Promise<Event[]> {
  return request<Event[]>(API_BASE);
}

/**
 * Saves an event (creates a new event if id is undefined, or updates existing if id is set).
 * Returns the created/updated event containing its server-assigned ID.
 */
export async function saveEvent(event: Event): Promise<{ id: number }> {
  return request<{ id: number }>(API_BASE, {
    method: "POST",
    body: JSON.stringify(event),
  });
}

/**
 * Deletes an event by ID.
 */
export async function deleteEvent(id: number): Promise<{ message: string }> {
  return request<{ message: string }>(`${API_BASE}/${id}`, {
    method: "DELETE",
  });
}