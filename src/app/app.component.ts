import { HttpClient } from '@angular/common/http';
import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';

interface ScryfallCard {
  id: string;
  name: string;
  image_uris?: { small?: string };
  card_faces?: Array<{ image_uris?: { small?: string } }>;
}

interface TierCard {
  id: string;
  name: string;
  imageUrl: string;
}

interface Tier {
  id: string;
  name: string;
  cards: TierCard[];
}

interface DragPayload {
  source: 'pool' | 'tier';
  sourceTierId?: string;
  sourceIndex: number;
}

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css'
})
export class AppComponent {
  setCode = '';
  loading = false;
  error = '';

  poolCards: TierCard[] = [];
  tiers: Tier[] = [
    { id: crypto.randomUUID(), name: 'S Tier', cards: [] },
    { id: crypto.randomUUID(), name: 'A Tier', cards: [] },
    { id: crypto.randomUUID(), name: 'B Tier', cards: [] },
    { id: crypto.randomUUID(), name: 'C Tier', cards: [] }
  ];

  constructor(private readonly http: HttpClient) {}

  async loadSet(): Promise<void> {
    const code = this.setCode.trim().toLowerCase();
    if (!code) {
      this.error = 'Enter a set code (example: dmu, neo, mh3).';
      return;
    }

    this.loading = true;
    this.error = '';
    this.poolCards = [];
    this.tiers.forEach((tier) => (tier.cards = []));

    try {
      const cards = await this.fetchAllCards(code);
      this.poolCards = cards.map((card) => ({
        id: card.id,
        name: card.name,
        imageUrl: this.pickImage(card)
      }));
      if (this.poolCards.length === 0) {
        this.error = `No cards found for set code "${code}".`;
      }
    } catch {
      this.error = 'Could not load cards from Scryfall. Check the set code and try again.';
    } finally {
      this.loading = false;
    }
  }

  addTier(): void {
    this.tiers.push({
      id: crypto.randomUUID(),
      name: `New Tier ${this.tiers.length + 1}`,
      cards: []
    });
  }

  onCardDragStart(event: DragEvent, source: 'pool' | 'tier', sourceIndex: number, sourceTierId?: string): void {
    const payload: DragPayload = { source, sourceIndex, sourceTierId };
    event.dataTransfer?.setData('text/plain', JSON.stringify(payload));
    event.dataTransfer!.effectAllowed = 'move';
  }

  allowDrop(event: DragEvent): void {
    event.preventDefault();
    event.dataTransfer!.dropEffect = 'move';
  }

  dropOnTier(event: DragEvent, tierId: string, targetIndex: number | null = null): void {
    event.preventDefault();
    const payload = this.readPayload(event);
    if (!payload) return;

    const card = this.extractCard(payload);
    if (!card) return;

    const targetTier = this.tiers.find((tier) => tier.id === tierId);
    if (!targetTier) return;

    if (targetIndex === null || targetIndex > targetTier.cards.length) {
      targetTier.cards.push(card);
    } else {
      targetTier.cards.splice(targetIndex, 0, card);
    }
  }

  dropOnPool(event: DragEvent, targetIndex: number | null = null): void {
    event.preventDefault();
    const payload = this.readPayload(event);
    if (!payload) return;

    const card = this.extractCard(payload);
    if (!card) return;

    if (targetIndex === null || targetIndex > this.poolCards.length) {
      this.poolCards.push(card);
    } else {
      this.poolCards.splice(targetIndex, 0, card);
    }
  }

  trackById(_: number, item: Tier | TierCard): string {
    return item.id;
  }

  private readPayload(event: DragEvent): DragPayload | null {
    const raw = event.dataTransfer?.getData('text/plain');
    if (!raw) return null;

    try {
      return JSON.parse(raw) as DragPayload;
    } catch {
      return null;
    }
  }

  private extractCard(payload: DragPayload): TierCard | null {
    if (payload.source === 'pool') {
      if (payload.sourceIndex < 0 || payload.sourceIndex >= this.poolCards.length) return null;
      return this.poolCards.splice(payload.sourceIndex, 1)[0];
    }

    const sourceTier = this.tiers.find((tier) => tier.id === payload.sourceTierId);
    if (!sourceTier) return null;
    if (payload.sourceIndex < 0 || payload.sourceIndex >= sourceTier.cards.length) return null;
    return sourceTier.cards.splice(payload.sourceIndex, 1)[0];
  }

  private async fetchAllCards(setCode: string): Promise<ScryfallCard[]> {
    const cards: ScryfallCard[] = [];
    let nextUrl = `https://api.scryfall.com/cards/search?q=e%3A${encodeURIComponent(setCode)}&unique=cards&order=set`;

    while (nextUrl) {
      const page = await this.http.get<{ data: ScryfallCard[]; has_more: boolean; next_page?: string }>(nextUrl).toPromise();
      if (!page?.data) break;

      cards.push(...page.data);
      nextUrl = page.has_more && page.next_page ? page.next_page : '';
    }

    return cards;
  }

  private pickImage(card: ScryfallCard): string {
    return card.image_uris?.small ?? card.card_faces?.[0]?.image_uris?.small ?? '';
  }
}
