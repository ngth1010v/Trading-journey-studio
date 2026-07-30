import type { Event } from "./event.model.js";
import { eventRepository, EventRepository } from "./event.repository.js";

export class EventService {
  constructor(private repo: EventRepository = eventRepository) {}

  public getAllEvents(): Event[] {
    return this.repo.getAll();
  }

  public saveEvent(eventData: Partial<Event>): { id: number } | null {
    if (!eventData.chartType || !eventData.event || !eventData.input) {
      throw new Error("Missing required fields: chartType, event, input");
    }

    const payload = {
      chartType: eventData.chartType,
      event: eventData.event,
      input: eventData.input,
    };

    if (eventData.id !== undefined && eventData.id !== null) {
      const updated = this.repo.update({
        id: eventData.id,
        ...payload,
      });

      if (!updated) {
        return null; // ID provided but record does not exist
      }

      return { id: eventData.id };
    }

    const newId = this.repo.create(payload);
    return { id: newId };
  }

  public deleteEvent(id: number): boolean {
    return this.repo.deleteById(id);
  }
}

export const eventService = new EventService();