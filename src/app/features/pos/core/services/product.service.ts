import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../../../environments/environment';
import { Product, CashierProductDto } from '../models/pos.models';
import { catchError, map } from 'rxjs/operators';
import { of } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class ProductService {
  private http = inject(HttpClient);
  private productsApiUrl = `${environment.apiUrl}/products`;

  // Signal to hold all cached products locally
  private productsSignal = signal<Product[]>([]);
  public products = this.productsSignal.asReadonly();

  constructor() {}

  /**
   * Fetches all products from the backend and maps them to the existing Product interface.
   * This should be called once when the Cashier page loads.
   */
  public loadAllProducts(): void {
    // Calling the endpoint that returns all products (from the prompt example)
    this.http.get<CashierProductDto[]>(`${this.productsApiUrl}/all-products`).pipe(
      map(dtoList => dtoList.map(dto => this.mapDtoToProduct(dto))),
      catchError(err => {
        console.error('Failed to load all products', err);
        return of([] as Product[]);
      })
    ).subscribe(products => {
      this.productsSignal.set(products);
    });
  }

  /**
   * Maps the specific CashierProductDto API response to the app's standard Product interface.
   */
  private mapDtoToProduct(dto: CashierProductDto): Product {
    return {
      id: dto.id,
      name: dto.name,
      barcode: dto.barcode,
      costPrice: dto.buyingPrice || 0,
      buyingPrice: dto.buyingPrice || 0,
      sellingPrice: dto.sellingPrice,
      stockQuantity: dto.stock,
      isActive: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
  }

  /**
   * Local, highly-efficient search using the cached signal array.
   */
  public searchProducts(query: string): Product[] {
    const term = query.trim().toLowerCase();
    if (!term) return [];
    
    const all = this.productsSignal();
    return all.filter(p => 
      p.barcode.toLowerCase().includes(term) || 
      p.name.toLowerCase().includes(term)
    );
  }
}
