import { HttpClient } from '@angular/common/http';
import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';

interface ScryfallCard {
  id: string;
  name: string;
  color_identity?: string[];
  rarity: string;
  image_uris?: { small?: string; normal?: string };
  card_faces?: Array<{ image_uris?: { small?: string; normal?: string } }>;
}

interface TierCard {
  id: string;
  name: string;
  imageUrl: string;
  previewImageUrl: string;
  colors: string[];
  rarity: string;
}

interface Tier {
  id: string;
  name: string;
  cards: TierCard[];
}

interface DragPayload {
  source: 'pool' | 'tier';
  sourceTierId?: string;
  cardId: string;
}

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css'
})
export class AppComponent {
  private readonly colorOrder = ['W', 'U', 'B', 'R', 'G', 'C'];
  private hoverTimer: ReturnType<typeof setTimeout> | null = null;

  setCode = '';
  loading = false;
  error = '';
  selectedColors: string[] = [];
  selectedRarities: string[] = [];
  tooltipCard: TierCard | null = null;
  tooltipPosition = { x: 0, y: 0 };

  poolCards: TierCard[] = [];
  tiers: Tier[] = [
    { id: crypto.randomUUID(), name: 'S Tier', cards: [] },
    { id: crypto.randomUUID(), name: 'A Tier', cards: [] },
    { id: crypto.randomUUID(), name: 'B Tier', cards: [] },
    { id: crypto.randomUUID(), name: 'C Tier', cards: [] }
  ];

  constructor(private readonly http: HttpClient) {}

  get filteredPoolCards(): TierCard[] {
    return this.poolCards.filter((card) => this.matchesColorFilter(card) && this.matchesRarityFilter(card));
  }

  get colorOptions(): string[] {
    const found = new Set<string>();
    this.poolCards.forEach((card) => {
      if (card.colors.length === 0) {
        found.add('C');
        return;
      }

      card.colors.forEach((color) => found.add(color));
    });

    return this.colorOrder.filter((color) => found.has(color));
  }

  get rarityOptions(): string[] {
    return ['common', 'uncommon', 'rare', 'mythic'].filter((rarity) =>
      this.poolCards.some((card) => card.rarity === rarity)
    );
  }

  isColorSelected(color: string): boolean {
    return this.selectedColors.includes(color);
  }

  isRaritySelected(rarity: string): boolean {
    return this.selectedRarities.includes(rarity);
  }

  onColorToggle(color: string, checked: boolean): void {
    this.selectedColors = this.toggleSelection(this.selectedColors, color, checked);
  }

  onRarityToggle(rarity: string, checked: boolean): void {
    this.selectedRarities = this.toggleSelection(this.selectedRarities, rarity, checked);
  }

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
        imageUrl: this.pickImage(card, 'small'),
        previewImageUrl: this.pickImage(card, 'normal'),
        colors: card.color_identity ?? [],
        rarity: card.rarity
      }));
      this.selectedColors = [];
      this.selectedRarities = [];
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

  resetBoard(): void {
    this.tiers.forEach((tier) => {
      this.poolCards.push(...tier.cards);
      tier.cards = [];
    });
  }

  onCardDragStart(event: DragEvent, source: 'pool' | 'tier', cardId: string, sourceTierId?: string): void {
    const payload: DragPayload = { source, cardId, sourceTierId };
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

  onCardMouseEnter(event: MouseEvent, card: TierCard): void {
    this.clearHoverTimer();
    this.hoverTimer = setTimeout(() => {
      this.tooltipCard = card;
      this.updateTooltipPosition(event);
    }, 500);
  }

  onCardMouseMove(event: MouseEvent): void {
    if (!this.tooltipCard) return;
    this.updateTooltipPosition(event);
  }

  onCardMouseLeave(): void {
    this.clearHoverTimer();
    this.tooltipCard = null;
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
      const sourceIndex = this.poolCards.findIndex((card) => card.id === payload.cardId);
      if (sourceIndex === -1) return null;
      return this.poolCards.splice(sourceIndex, 1)[0];
    }

    const sourceTier = this.tiers.find((tier) => tier.id === payload.sourceTierId);
    if (!sourceTier) return null;
    const sourceIndex = sourceTier.cards.findIndex((card) => card.id === payload.cardId);
    if (sourceIndex === -1) return null;
    return sourceTier.cards.splice(sourceIndex, 1)[0];
  }

  private matchesColorFilter(card: TierCard): boolean {
    if (this.selectedColors.length === 0) return true;

    const cardColors = card.colors.length === 0 ? ['C'] : card.colors;
    return cardColors.every((color) => this.selectedColors.includes(color));
  }

  private matchesRarityFilter(card: TierCard): boolean {
    if (this.selectedRarities.length === 0) return true;
    return this.selectedRarities.includes(card.rarity);
  }

  private toggleSelection(selectedValues: string[], value: string, checked: boolean): string[] {
    if (checked) {
      return selectedValues.includes(value) ? selectedValues : [...selectedValues, value];
    }

    return selectedValues.filter((selectedValue) => selectedValue !== value);
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

  private pickImage(card: ScryfallCard, size: 'small' | 'normal'): string {
    return card.image_uris?.[size] ?? card.card_faces?.[0]?.image_uris?.[size] ?? '';
  }

  private updateTooltipPosition(event: MouseEvent): void {
    this.tooltipPosition = { x: event.clientX + 16, y: event.clientY + 16 };
  }

  private clearHoverTimer(): void {
    if (!this.hoverTimer) return;
    clearTimeout(this.hoverTimer);
    this.hoverTimer = null;
  }
}
